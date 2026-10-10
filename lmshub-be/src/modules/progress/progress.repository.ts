import { query, queryOne } from '../../core/db/pool';

export type LessonProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgressRow {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  status: LessonProgressStatus;
  position_seconds: number;
  end_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseProgressRow {
  id: string;
  enrollment_id: string;
  progress_percent: string; // numeric(5,2) datang sebagai string from pg
  completed_lessons_count: number;
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
  content: string;
  timestamp_detik: number | null;
  created_at: string;
  updated_at: string;
}

export interface BookmarkRow {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  position_seconds: number | null;
  notes: string | null;
  created_at: string;
}

// ── Learn view (kurikulum + progres untuk student ter-enroll) ──

export interface LearnCourseRow {
  id: string;
  title: string;
  allow_restart: boolean;
  final_exam_quiz_id: string | null;
  final_exam_title: string | null;
}

export interface LearnSectionRow {
  id: string;
  title: string;
  sort_order: number;
}

export interface LearnLessonRow {
  id: string;
  section_id: string;
  title: string;
  type: string;
  sort_order: number;
  duration_minutes: number | null;
  gratis_preview: boolean;
  drip_release_at: string | null;
  must_complete: boolean;
  content_body: string | null;
  content_url: string | null;
}

/**
 * Apakah `userId` adalah instructor pengampu course ini?
 *
 * Dipakai agar staf pengelola bisa membuka content course tanpa harus mendaftar
 * sebagai student — mereka perlu melihat material untuk memoderasi Tanya-Jawab.
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
  // exam akhir hanya dilaporkan bila masih bisa dikerjakan (active, belum dihapus).
  return queryOne<LearnCourseRow>(
    `SELECT c.id, c.title, c.allow_restart, q.id AS final_exam_quiz_id, q.title AS final_exam_title
       FROM courses c
       LEFT JOIN quizzes q ON q.id = c.final_exam_quiz_id AND q.deleted_at IS NULL AND q.is_active = true
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [courseId],
  );
}

export async function learnSections(courseId: string): Promise<LearnSectionRow[]> {
  return query<LearnSectionRow>(
    `SELECT id, title, sort_order FROM sections WHERE course_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC`,
    [courseId],
  );
}

export async function learnLessons(courseId: string): Promise<LearnLessonRow[]> {
  return query<LearnLessonRow>(
    `SELECT l.id, l.section_id, l.title, l.type, l.sort_order, l.duration_minutes,
            l.gratis_preview, l.drip_release_at, l.must_complete,
            c.body AS content_body, c.url AS content_url
       FROM lessons l
       JOIN sections s ON s.id = l.section_id
       LEFT JOIN LATERAL (
         -- A lesson may pointst at a Media Library asset instead of a URL; the
         -- player only knows URLs, so resolve the asset's stored path here.
         -- Unfinished or deleted assets resolve to nothing rather than a dead link.
         SELECT lc.body, COALESCE(lc.url, ma.path_object_storage) AS url
           FROM lesson_contents lc
           LEFT JOIN media_assets ma
             ON ma.id = lc.media_asset_id AND ma.deleted_at IS NULL AND ma.status_transcode = 'completed'
          WHERE lc.lesson_id = l.id AND lc.deleted_at IS NULL
          ORDER BY lc.sort_order ASC LIMIT 1
       ) c ON true
      WHERE s.course_id = $1 AND l.deleted_at IS NULL AND s.deleted_at IS NULL
      ORDER BY s.sort_order ASC, l.sort_order ASC`,
    [courseId],
  );
}

export interface LearnLessonContentRow {
  id: string;
  lesson_id: string;
  type: string;
  sort_order: number;
  content_body: string | null;
  content_url: string | null;
}

export async function learnLessonContents(courseId: string): Promise<LearnLessonContentRow[]> {
  return query<LearnLessonContentRow>(
    `SELECT lc.id, lc.lesson_id, lc.type, lc.sort_order, lc.body AS content_body, COALESCE(lc.url, ma.path_object_storage) AS content_url
       FROM lesson_contents lc
       JOIN lessons l ON l.id = lc.lesson_id
       JOIN sections s ON s.id = l.section_id
       LEFT JOIN media_assets ma ON ma.id = lc.media_asset_id AND ma.deleted_at IS NULL AND ma.status_transcode = 'completed'
      WHERE s.course_id = $1 AND lc.deleted_at IS NULL AND l.deleted_at IS NULL AND s.deleted_at IS NULL
      ORDER BY lc.lesson_id, lc.sort_order ASC`,
    [courseId],
  );
}

export async function lessonProgressOfEnrollment(
  enrollmentId: string,
): Promise<Array<{ lesson_id: string; status: LessonProgressStatus; position_seconds: number }>> {
  return query<{ lesson_id: string; status: LessonProgressStatus; position_seconds: number }>(
    `SELECT lesson_id, status, position_seconds FROM lesson_progress WHERE enrollment_id = $1 AND deleted_at IS NULL`,
    [enrollmentId],
  );
}

/** Resolusi lesson -> course_id via sections (domain 02, read read-only). */
export async function lessonCourseId(lessonId: string): Promise<{ course_id: string; must_complete: boolean } | null> {
  return queryOne<{ course_id: string; must_complete: boolean }>(
    `SELECT s.course_id, l.must_complete
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
  position_seconds: number;
}): Promise<LessonProgressRow> {
  const row = await queryOne<LessonProgressRow>(
    `INSERT INTO lesson_progress (enrollment_id, lesson_id, status, position_seconds, end_time)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (enrollment_id, lesson_id) DO UPDATE SET
       status = EXCLUDED.status,
       position_seconds = EXCLUDED.position_seconds,
       end_time = CASE WHEN EXCLUDED.status = 'completed' THEN COALESCE(lesson_progress.end_time, now()) ELSE lesson_progress.end_time END,
       updated_at = now()
     RETURNING *`,
    [data.enrollment_id, data.lesson_id, data.status, data.position_seconds, data.status === 'completed' ? new Date() : null],
  );
  return row!;
}

export async function countCourseLessons(courseId: string): Promise<{ total: number; wajib: number }> {
  const row = await queryOne<{ total: string; wajib: string }>(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE l.must_complete)::int AS wajib
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
      WHERE lp.enrollment_id = $1 AND s.course_id = $2 AND lp.status = 'completed' AND l.must_complete AND lp.deleted_at IS NULL`,
    [enrollmentId, courseId],
  );
  return Number(row?.count ?? 0);
}

export async function getCourseProgress(enrollmentId: string): Promise<CourseProgressRow | null> {
  return queryOne<CourseProgressRow>(`SELECT * FROM course_progress WHERE enrollment_id = $1 AND deleted_at IS NULL`, [enrollmentId]);
}

export async function upsertCourseProgress(data: {
  enrollment_id: string;
  progress_percent: number;
  completed_lessons_count: number;
  total_lesson: number;
  completed: boolean;
}): Promise<CourseProgressRow> {
  const row = await queryOne<CourseProgressRow>(
    `INSERT INTO course_progress (enrollment_id, progress_percent, completed_lessons_count, total_lesson, last_accessed_at, completed_at)
     VALUES ($1,$2,$3,$4, now(), CASE WHEN $5 THEN now() ELSE NULL END)
     ON CONFLICT (enrollment_id) DO UPDATE SET
       progress_percent = EXCLUDED.progress_percent,
       completed_lessons_count = EXCLUDED.completed_lessons_count,
       total_lesson = EXCLUDED.total_lesson,
       last_accessed_at = now(),
       completed_at = CASE WHEN $5 THEN COALESCE(course_progress.completed_at, now()) ELSE course_progress.completed_at END,
       updated_at = now()
     RETURNING *`,
    [data.enrollment_id, data.progress_percent, data.completed_lessons_count, data.total_lesson, data.completed],
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
  content: string;
  timestamp_detik: number | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO notes (enrollment_id, lesson_id, content, timestamp_detik) VALUES ($1,$2,$3,$4) RETURNING id`,
    [data.enrollment_id, data.lesson_id, data.content, data.timestamp_detik],
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
    `SELECT * FROM bookmarks WHERE enrollment_id = $1 AND lesson_id = $2 ORDER BY position_seconds NULLS LAST, created_at`,
    [enrollmentId, lessonId],
  );
}

export async function findBookmark(id: string): Promise<BookmarkRow | null> {
  return queryOne<BookmarkRow>(`SELECT * FROM bookmarks WHERE id = $1`, [id]);
}

export async function insertBookmark(data: {
  enrollment_id: string;
  lesson_id: string;
  position_seconds: number | null;
  notes: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO bookmarks (enrollment_id, lesson_id, position_seconds, notes) VALUES ($1,$2,$3,$4) RETURNING id`,
    [data.enrollment_id, data.lesson_id, data.position_seconds, data.notes],
  );
  return row!;
}

/** `bookmarks` tanpa soft delete (delete permanen) — sesuai skema domain 03. */
export async function hardDeleteBookmark(id: string): Promise<void> {
  await query(`DELETE FROM bookmarks WHERE id = $1`, [id]);
}
