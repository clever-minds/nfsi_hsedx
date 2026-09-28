import { query, queryOne } from '../../core/db/pool';

export type LessonProgressStatus = 'belum' | 'sedang' | 'selesai';

export interface LessonProgressRow {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  status: LessonProgressStatus;
  posisi_detik: number;
  waktu_selesai: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseProgressRow {
  id: string;
  enrollment_id: string;
  persen_selesai: string; // numeric(5,2) datang sebagai string dari pg
  jumlah_lesson_selesai: number;
  total_lesson: number;
  last_accessed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  enrollment_id: string;
  lesson_id: string | null;
  isi: string;
  timestamp_detik: number | null;
  created_at: string;
  updated_at: string;
}

export interface BookmarkRow {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  posisi_detik: number | null;
  catatan: string | null;
  created_at: string;
}

// ── Learn view (kurikulum + progres untuk siswa ter-enroll) ──

export interface LearnCourseRow {
  id: string;
  judul: string;
}

export interface LearnSectionRow {
  id: string;
  judul: string;
  urutan: number;
}

export interface LearnLessonRow {
  id: string;
  section_id: string;
  judul: string;
  tipe: string;
  urutan: number;
  durasi_menit: number | null;
  gratis_preview: boolean;
  drip_release_at: string | null;
  wajib_selesai: boolean;
  content_body: string | null;
  content_url: string | null;
}

/**
 * Apakah `userId` adalah instruktur pengampu kursus ini?
 *
 * Dipakai agar staf pengelola bisa membuka isi kursus tanpa harus mendaftar
 * sebagai siswa — mereka perlu melihat materi untuk memoderasi Tanya-Jawab.
 */
export async function isCourseInstructor(courseId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ada: number }>(
    `SELECT 1 AS ada
       FROM courses c
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
      WHERE c.id = $1 AND ip.user_id = $2 AND c.deleted_at IS NULL`,
    [courseId, userId],
  );
  return !!row;
}

export async function learnCourse(courseId: string): Promise<LearnCourseRow | null> {
  return queryOne<LearnCourseRow>(`SELECT id, judul FROM courses WHERE id = $1 AND deleted_at IS NULL`, [courseId]);
}

export async function learnSections(courseId: string): Promise<LearnSectionRow[]> {
  return query<LearnSectionRow>(
    `SELECT id, judul, urutan FROM sections WHERE course_id = $1 AND deleted_at IS NULL ORDER BY urutan ASC`,
    [courseId],
  );
}

/** Semua lesson kursus + konten pertama per lesson (untuk player). */
export async function learnLessons(courseId: string): Promise<LearnLessonRow[]> {
  return query<LearnLessonRow>(
    `SELECT l.id, l.section_id, l.judul, l.tipe, l.urutan, l.durasi_menit,
            l.gratis_preview, l.drip_release_at, l.wajib_selesai,
            c.body AS content_body, c.url AS content_url
       FROM lessons l
       JOIN sections s ON s.id = l.section_id
       LEFT JOIN LATERAL (
         SELECT lc.body, lc.url
           FROM lesson_contents lc
          WHERE lc.lesson_id = l.id AND lc.deleted_at IS NULL
          ORDER BY lc.urutan ASC LIMIT 1
       ) c ON true
      WHERE s.course_id = $1 AND l.deleted_at IS NULL AND s.deleted_at IS NULL
      ORDER BY s.urutan ASC, l.urutan ASC`,
    [courseId],
  );
}

export async function lessonProgressOfEnrollment(
  enrollmentId: string,
): Promise<Array<{ lesson_id: string; status: LessonProgressStatus; posisi_detik: number }>> {
  return query<{ lesson_id: string; status: LessonProgressStatus; posisi_detik: number }>(
    `SELECT lesson_id, status, posisi_detik FROM lesson_progress WHERE enrollment_id = $1 AND deleted_at IS NULL`,
    [enrollmentId],
  );
}

/** Resolusi lesson -> course_id via sections (domain 02, dibaca read-only). */
export async function lessonCourseId(lessonId: string): Promise<{ course_id: string; wajib_selesai: boolean } | null> {
  return queryOne<{ course_id: string; wajib_selesai: boolean }>(
    `SELECT s.course_id, l.wajib_selesai
       FROM lessons l JOIN sections s ON s.id = l.section_id
      WHERE l.id = $1 AND l.deleted_at IS NULL`,
    [lessonId],
  );
}

export async function findLessonProgress(enrollmentId: string, lessonId: string): Promise<LessonProgressRow | null> {
  return queryOne<LessonProgressRow>(
    `SELECT * FROM lesson_progress WHERE enrollment_id = $1 AND lesson_id = $2 AND deleted_at IS NULL`,
    [enrollmentId, lessonId],
  );
}

export async function upsertLessonProgress(data: {
  enrollment_id: string;
  lesson_id: string;
  status: LessonProgressStatus;
  posisi_detik: number;
}): Promise<LessonProgressRow> {
  const row = await queryOne<LessonProgressRow>(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id, status, posisi_detik, waktu_selesai)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET
       status = EXCLUDED.status,
       posisi_detik = EXCLUDED.posisi_detik,
       waktu_selesai = CASE WHEN EXCLUDED.status = 'selesai' THEN COALESCE(lesson_progress.waktu_selesai, now()) ELSE lesson_progress.waktu_selesai END,
       updated_at = now()
     RETURNING *`,
    [data.enrollment_id, data.lesson_id, data.status, data.posisi_detik, data.status === 'selesai' ? new Date() : null],
  );
  return row!;
}

export async function countCourseLessons(courseId: string): Promise<{ total: number; wajib: number }> {
  const row = await queryOne<{ total: string; wajib: string }>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE l.wajib_selesai)::int AS wajib
       FROM lessons l JOIN sections s ON s.id = l.section_id
      WHERE s.course_id = $1 AND l.deleted_at IS NULL`,
    [courseId],
  );
  return { total: Number(row?.total ?? 0), wajib: Number(row?.wajib ?? 0) };
}

export async function countCompletedWajibLessons(enrollmentId: string, courseId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count
       FROM lesson_progress lp
       JOIN lessons l ON l.id = lp.lesson_id
       JOIN sections s ON s.id = l.section_id
      WHERE lp.enrollment_id = $1 AND s.course_id = $2 AND lp.status = 'selesai' AND l.wajib_selesai AND lp.deleted_at IS NULL`,
    [enrollmentId, courseId],
  );
  return Number(row?.count ?? 0);
}

export async function getCourseProgress(enrollmentId: string): Promise<CourseProgressRow | null> {
  return queryOne<CourseProgressRow>(`SELECT * FROM course_progress WHERE enrollment_id = $1 AND deleted_at IS NULL`, [enrollmentId]);
}

export async function upsertCourseProgress(data: {
  enrollment_id: string;
  persen_selesai: number;
  jumlah_lesson_selesai: number;
  total_lesson: number;
  completed: boolean;
}): Promise<CourseProgressRow> {
  const row = await queryOne<CourseProgressRow>(
    `INSERT INTO course_progress (enrollment_id, persen_selesai, jumlah_lesson_selesai, total_lesson, last_accessed_at, completed_at)
     VALUES ($1,$2,$3,$4, now(), CASE WHEN $5 THEN now() ELSE NULL END)
     ON CONFLICT (enrollment_id) DO UPDATE SET
       persen_selesai = EXCLUDED.persen_selesai,
       jumlah_lesson_selesai = EXCLUDED.jumlah_lesson_selesai,
       total_lesson = EXCLUDED.total_lesson,
       last_accessed_at = now(),
       completed_at = CASE WHEN $5 THEN COALESCE(course_progress.completed_at, now()) ELSE course_progress.completed_at END,
       updated_at = now()
     RETURNING *`,
    [data.enrollment_id, data.persen_selesai, data.jumlah_lesson_selesai, data.total_lesson, data.completed],
  );
  return row!;
}

// ── Notes ───────────────────────────────────────────────

export async function listNotes(enrollmentId: string, lessonId: string): Promise<NoteRow[]> {
  return query<NoteRow>(
    `SELECT * FROM notes WHERE enrollment_id = $1 AND lesson_id = $2 AND deleted_at IS NULL ORDER BY timestamp_detik NULLS LAST, created_at`,
    [enrollmentId, lessonId],
  );
}

export async function findNote(id: string): Promise<NoteRow | null> {
  return queryOne<NoteRow>(`SELECT * FROM notes WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertNote(data: {
  enrollment_id: string;
  lesson_id: string | null;
  isi: string;
  timestamp_detik: number | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO notes (enrollment_id, lesson_id, isi, timestamp_detik) VALUES ($1,$2,$3,$4) RETURNING id`,
    [data.enrollment_id, data.lesson_id, data.isi, data.timestamp_detik],
  );
  return row!;
}

export async function updateNote(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE notes SET ${set}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteNote(id: string): Promise<void> {
  await query(`UPDATE notes SET deleted_at = now() WHERE id = $1`, [id]);
}

// ── Bookmarks ───────────────────────────────────────────

export async function listBookmarks(enrollmentId: string, lessonId: string): Promise<BookmarkRow[]> {
  return query<BookmarkRow>(
    `SELECT * FROM bookmarks WHERE enrollment_id = $1 AND lesson_id = $2 ORDER BY posisi_detik NULLS LAST, created_at`,
    [enrollmentId, lessonId],
  );
}

export async function findBookmark(id: string): Promise<BookmarkRow | null> {
  return queryOne<BookmarkRow>(`SELECT * FROM bookmarks WHERE id = $1`, [id]);
}

export async function insertBookmark(data: {
  enrollment_id: string;
  lesson_id: string;
  posisi_detik: number | null;
  catatan: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO bookmarks (enrollment_id, lesson_id, posisi_detik, catatan) VALUES ($1,$2,$3,$4) RETURNING id`,
    [data.enrollment_id, data.lesson_id, data.posisi_detik, data.catatan],
  );
  return row!;
}

/** `bookmarks` tanpa soft delete (hapus permanen) — sesuai skema domain 03. */
export async function hardDeleteBookmark(id: string): Promise<void> {
  await query(`DELETE FROM bookmarks WHERE id = $1`, [id]);
}
