import { query, queryOne } from '../../core/db/pool';

export interface SectionRow {
  id: string;
  course_id: string;
  judul: string;
  urutan: number;
  deskripsi: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonRow {
  id: string;
  section_id: string;
  judul: string;
  tipe: string;
  urutan: number;
  durasi_menit: number | null;
  gratis_preview: boolean;
  drip_release_at: string | null;
  wajib_selesai: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonContentRow {
  id: string;
  lesson_id: string;
  tipe: string;
  urutan: number;
  body: string | null;
  media_asset_id: string | null;
  url: string | null;
  scorm_manifest_url: string | null;
  durasi_detik: number | null;
  created_at: string;
  updated_at: string;
}

export async function courseExists(courseId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM courses WHERE id = $1 AND deleted_at IS NULL) AS ok`,
    [courseId],
  );
  return row?.ok ?? false;
}

/** `courses.instructor_id` pemilik kursus — dipakai guard row-level "Sendiri" untuk instruktur. */
/** Kembalikan USER id instruktur pemilik kursus (courses.instructor_id → instructor_profiles.user_id). */
export async function courseInstructorId(courseId: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT ip.user_id
       FROM courses c
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [courseId],
  );
  return row?.user_id ?? null;
}

// ── Sections ─────────────────────────────────────────
export async function listSections(courseId: string): Promise<SectionRow[]> {
  return query<SectionRow>(
    `SELECT id, course_id, judul, urutan, deskripsi, created_at, updated_at
       FROM sections WHERE course_id = $1 AND deleted_at IS NULL ORDER BY urutan ASC`,
    [courseId],
  );
}

export async function sectionDetail(id: string): Promise<SectionRow | null> {
  return queryOne<SectionRow>(
    `SELECT id, course_id, judul, urutan, deskripsi, created_at, updated_at
       FROM sections WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function insertSection(data: {
  course_id: string;
  judul: string;
  urutan: number;
  deskripsi: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO sections (course_id, judul, urutan, deskripsi) VALUES ($1,$2,$3,$4) RETURNING id`,
    [data.course_id, data.judul, data.urutan, data.deskripsi],
  );
  return row!;
}

export async function updateSection(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE sections SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteSection(id: string): Promise<void> {
  await query(`UPDATE sections SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function nextSectionUrutan(courseId: string): Promise<number> {
  const row = await queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(urutan), -1) + 1 AS next FROM sections WHERE course_id = $1 AND deleted_at IS NULL`,
    [courseId],
  );
  return row?.next ?? 0;
}

export async function reorderSections(items: Array<{ id: string; urutan: number }>): Promise<void> {
  for (const item of items) {
    await query(`UPDATE sections SET urutan = $2 WHERE id = $1`, [item.id, item.urutan]);
  }
}

// ── Lessons ──────────────────────────────────────────
export async function listLessonsBySection(sectionId: string): Promise<LessonRow[]> {
  return query<LessonRow>(
    `SELECT id, section_id, judul, tipe, urutan, durasi_menit, gratis_preview, drip_release_at, wajib_selesai, created_at, updated_at
       FROM lessons WHERE section_id = $1 AND deleted_at IS NULL ORDER BY urutan ASC`,
    [sectionId],
  );
}

export async function lessonDetail(id: string): Promise<LessonRow | null> {
  return queryOne<LessonRow>(
    `SELECT id, section_id, judul, tipe, urutan, durasi_menit, gratis_preview, drip_release_at, wajib_selesai, created_at, updated_at
       FROM lessons WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function insertLesson(data: {
  section_id: string;
  judul: string;
  tipe: string;
  urutan: number;
  durasi_menit: number | null;
  gratis_preview: boolean;
  drip_release_at: string | null;
  wajib_selesai: boolean;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO lessons (section_id, judul, tipe, urutan, durasi_menit, gratis_preview, drip_release_at, wajib_selesai)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      data.section_id,
      data.judul,
      data.tipe,
      data.urutan,
      data.durasi_menit,
      data.gratis_preview,
      data.drip_release_at,
      data.wajib_selesai,
    ],
  );
  return row!;
}

export async function updateLesson(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE lessons SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteLesson(id: string): Promise<void> {
  await query(`UPDATE lessons SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function nextLessonUrutan(sectionId: string): Promise<number> {
  const row = await queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(urutan), -1) + 1 AS next FROM lessons WHERE section_id = $1 AND deleted_at IS NULL`,
    [sectionId],
  );
  return row?.next ?? 0;
}

export async function reorderLessons(
  items: Array<{ id: string; urutan: number; section_id?: string }>,
): Promise<void> {
  for (const item of items) {
    if (item.section_id) {
      await query(`UPDATE lessons SET urutan = $2, section_id = $3 WHERE id = $1`, [
        item.id,
        item.urutan,
        item.section_id,
      ]);
    } else {
      await query(`UPDATE lessons SET urutan = $2 WHERE id = $1`, [item.id, item.urutan]);
    }
  }
}

export async function courseIdOfLesson(lessonId: string): Promise<string | null> {
  const row = await queryOne<{ course_id: string }>(
    `SELECT s.course_id
       FROM lessons l JOIN sections s ON s.id = l.section_id
      WHERE l.id = $1 AND l.deleted_at IS NULL`,
    [lessonId],
  );
  return row?.course_id ?? null;
}

// ── Lesson Contents ──────────────────────────────────
export async function listContents(lessonId: string): Promise<LessonContentRow[]> {
  return query<LessonContentRow>(
    `SELECT id, lesson_id, tipe, urutan, body, media_asset_id, url, scorm_manifest_url, durasi_detik, created_at, updated_at
       FROM lesson_contents WHERE lesson_id = $1 AND deleted_at IS NULL ORDER BY urutan ASC`,
    [lessonId],
  );
}

export async function contentDetail(id: string): Promise<LessonContentRow | null> {
  return queryOne<LessonContentRow>(
    `SELECT id, lesson_id, tipe, urutan, body, media_asset_id, url, scorm_manifest_url, durasi_detik, created_at, updated_at
       FROM lesson_contents WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function insertContent(data: {
  lesson_id: string;
  tipe: string;
  urutan: number;
  body: string | null;
  media_asset_id: string | null;
  url: string | null;
  scorm_manifest_url: string | null;
  durasi_detik: number | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO lesson_contents (lesson_id, tipe, urutan, body, media_asset_id, url, scorm_manifest_url, durasi_detik)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      data.lesson_id,
      data.tipe,
      data.urutan,
      data.body,
      data.media_asset_id,
      data.url,
      data.scorm_manifest_url,
      data.durasi_detik,
    ],
  );
  return row!;
}

export async function updateContent(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE lesson_contents SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteContent(id: string): Promise<void> {
  await query(`UPDATE lesson_contents SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function nextContentUrutan(lessonId: string): Promise<number> {
  const row = await queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(urutan), -1) + 1 AS next FROM lesson_contents WHERE lesson_id = $1 AND deleted_at IS NULL`,
    [lessonId],
  );
  return row?.next ?? 0;
}

export async function courseIdOfContent(contentId: string): Promise<string | null> {
  const row = await queryOne<{ course_id: string }>(
    `SELECT s.course_id
       FROM lesson_contents lc
       JOIN lessons l ON l.id = lc.lesson_id
       JOIN sections s ON s.id = l.section_id
      WHERE lc.id = $1 AND lc.deleted_at IS NULL`,
    [contentId],
  );
  return row?.course_id ?? null;
}
