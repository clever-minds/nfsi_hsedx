import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

/**
 * `instructor_id` menunjuk ke `instructor_profiles(id)`, bukan ke `users(id)`.
 *
 * Keduanya uuid, jadi salah satu bisa dipakai tanpa error tipe tetapi selalu
 * mengembalikan nol baris. Karena itu setiap query yang menampilkan name
 * instructor menempuh dua join — `instructor_profiles` lalu `users` — dan
 * penyaringan "course milik sendiri" memakai id profil, bukan id pengguna.
 */
export interface CourseRow {
  id: string;
  /** Quiz yang menjadi ujian akhir (NULL = tanpa ujian). */
  final_exam_quiz_id?: string | null;
  /** Student boleh mengulang course dari nol. */
  allow_restart?: boolean;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  category_id: string;
  category_nama: string | null;
  instructor_id: string;
  instructor_nama: string | null;
  level: string;
  price: string;
  strike_price: string | null;
  publication_status: string;
  thumbnail_media_id: string | null;
  promo_video_media_id: string | null;
  language: string;
  durasi_total_menit: number;
  rating_avg: string;
  rating_count: number;
  student_count: number;
  published_at: string | null;
  meta: unknown;
  created_at: string;
  updated_at: string;
}

export interface Filters {
  status?: string;
  category_id?: string;
  instructor_id?: string;
  level?: string;
  q?: string;
  /** Row-level: non-admin instructor dibatasi ke course miliknya. */
  scopeInstructorId?: string | null;
}

const BASE_SELECT = `
  SELECT c.id, c.title, c.slug, c.summary, c.description, c.category_id, cat.name AS category_nama,
         c.instructor_id, u.nama_lengkap AS instructor_nama, c.level, c.price, c.strike_price,
         c.publication_status, c.thumbnail_media_id, c.promo_video_media_id, c.language,
         c.durasi_total_menit, c.rating_avg, c.rating_count, c.student_count, c.published_at,
         c.meta, c.final_exam_quiz_id, c.allow_restart, c.created_at, c.updated_at
    FROM courses c
    JOIN categories cat ON cat.id = c.category_id
    JOIN instructor_profiles ip ON ip.id = c.instructor_id
    JOIN users u ON u.id = ip.user_id`;

export async function list(p: PageParams, f: Filters): Promise<{ rows: CourseRow[]; total: number }> {
  const where: string[] = ['c.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.status) add('c.publication_status = $?', f.status);
  if (f.category_id) add('c.category_id = $?', f.category_id);
  if (f.instructor_id) add('c.instructor_id = $?', f.instructor_id);
  if (f.level) add('c.level = $?', f.level);
  if (f.scopeInstructorId) add('c.instructor_id = $?', f.scopeInstructorId);
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(c.title ILIKE $${params.length} OR c.summary ILIKE $${params.length})`);
  }

  const whereSql = where.join(' AND ');
  const sortCol = ['title', 'price', 'publication_status', 'created_at'].includes(p.sort ?? '')
    ? `c.${p.sort}`
    : 'c.created_at';

  const rows = await query<CourseRow>(
    `${BASE_SELECT} WHERE ${whereSql} ORDER BY ${sortCol} ${p.order} LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM courses c WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function detail(id: string): Promise<CourseRow | null> {
  return queryOne<CourseRow>(`${BASE_SELECT} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
}

export async function bySlug(slug: string): Promise<CourseRow | null> {
  return queryOne<CourseRow>(`${BASE_SELECT} WHERE c.slug = $1 AND c.deleted_at IS NULL`, [slug]);
}

export async function insert(data: {
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  category_id: string;
  instructor_id: string;
  level: string;
  price: number;
  strike_price: number | null;
  thumbnail_media_id: string | null;
  promo_video_media_id: string | null;
  language: string;
  meta: unknown;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO courses
      (title, slug, summary, description, category_id, instructor_id, level, price, strike_price,
       publication_status, thumbnail_media_id, promo_video_media_id, language, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draf',$10,$11,$12,$13)
     RETURNING id`,
    [
      data.title,
      data.slug,
      data.summary,
      data.description,
      data.category_id,
      data.instructor_id,
      data.level,
      data.price,
      data.strike_price,
      data.thumbnail_media_id,
      data.promo_video_media_id,
      data.language,
      data.meta ? JSON.stringify(data.meta) : null,
    ],
  );
  return row!;
}

export async function update(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => (k === 'meta' ? JSON.stringify(fields[k]) : fields[k]));
  await query(`UPDATE courses SET ${set} WHERE id = $1`, [id, ...values]);
}

export async function setStatus(id: string, status: string, publishedAt?: Date | null): Promise<void> {
  if (publishedAt !== undefined) {
    await query(`UPDATE courses SET publication_status = $2, published_at = $3 WHERE id = $1`, [
      id,
      status,
      publishedAt,
    ]);
  } else {
    await query(`UPDATE courses SET publication_status = $2 WHERE id = $1`, [id, status]);
  }
}

export async function softDelete(id: string): Promise<void> {
  await query(`UPDATE courses SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function categoryExists(id: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM categories WHERE id = $1 AND deleted_at IS NULL) AS ok`,
    [id],
  );
  return row?.ok ?? false;
}

/** instructor_profiles.id milik `userId` (read-only), atau null bila belum ada. */
export async function instructorProfileIdOf(userId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM instructor_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return row?.id ?? null;
}

/** Kembalikan instructor_profiles.id milik `userId`; buat otomatis bila belum ada. */
export async function ensureInstructorProfile(userId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM instructor_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  if (existing) return existing.id;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO instructor_profiles (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`,
    [userId],
  );
  return row!.id;
}

export async function mediaAssetExists(id: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM media_assets WHERE id = $1 AND deleted_at IS NULL) AS ok`,
    [id],
  );
  return row?.ok ?? false;
}

// ── Publik (catalog pra-login) ──────────────────────
export interface PublicFilters {
  category_slug?: string;
  level?: string;
  harga_min?: number;
  harga_max?: number;
  q?: string;
}

export interface PublicCourseRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category_nama: string | null;
  category_slug: string | null;
  instructor_nama: string | null;
  instructor_foto: string | null;
  level: string;
  price: string;
  strike_price: string | null;
  thumbnail_media_id: string | null;
  language: string;
  durasi_total_menit: number;
  rating_avg: string;
  rating_count: number;
  student_count: number;
  published_at: string | null;
  meta: unknown;
}

export async function publicList(
  p: PageParams,
  f: PublicFilters,
): Promise<{ rows: PublicCourseRow[]; total: number }> {
  const where: string[] = [`c.deleted_at IS NULL`, `c.publication_status IN ('terbit','diperbarui')`];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.category_slug) add('cat.slug = $?', f.category_slug);
  if (f.level) add('c.level = $?', f.level);
  if (f.harga_min !== undefined) add('c.price >= $?', f.harga_min);
  if (f.harga_max !== undefined) add('c.price <= $?', f.harga_max);
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(c.title ILIKE $${params.length} OR c.summary ILIKE $${params.length})`);
  }

  const whereSql = where.join(' AND ');
  const sortCol = ['title', 'price', 'published_at'].includes(p.sort ?? '') ? `c.${p.sort}` : 'c.published_at';

  const rows = await query<PublicCourseRow>(
    `SELECT c.id, c.title, c.slug, c.summary, cat.name AS category_nama, cat.slug AS category_slug,
            u.nama_lengkap AS instructor_nama, u.foto_profil AS instructor_foto,
            c.level, c.price, c.strike_price, c.thumbnail_media_id, c.language, c.durasi_total_menit,
            c.rating_avg, c.rating_count, c.student_count, c.published_at, c.meta
       FROM courses c
       JOIN categories cat ON cat.id = c.category_id
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
    JOIN users u ON u.id = ip.user_id
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${p.order} NULLS LAST
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM courses c JOIN categories cat ON cat.id = c.category_id WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export interface PublicCourseDetail extends PublicCourseRow {
  description: string | null;
  promo_video_media_id: string | null;
  instructor_id: string;
  // Profil instructor (untuk kartu "Tentang Instructor" & tautan ke halaman detailnya).
  instructor_bio: string | null;
  instructor_keahlian: unknown;
  instructor_rating: string | null;
  instructor_rating_count: number | null;
  instructor_total_siswa: number | null;
  instructor_jumlah_kursus: number | null;
}

export async function publicBySlug(slug: string): Promise<PublicCourseDetail | null> {
  return queryOne<PublicCourseDetail>(
    `SELECT c.id, c.title, c.slug, c.summary, c.description, cat.name AS category_nama, cat.slug AS category_slug,
            c.instructor_id, u.nama_lengkap AS instructor_nama, u.foto_profil AS instructor_foto,
            ip.bio AS instructor_bio, ip.keahlian AS instructor_keahlian,
            ip.rating_avg AS instructor_rating, ip.rating_count AS instructor_rating_count,
            ip.total_siswa AS instructor_total_siswa,
            (SELECT COUNT(*)::int FROM courses cx
              WHERE cx.instructor_id = ip.id AND cx.deleted_at IS NULL
                AND cx.publication_status IN ('terbit','diperbarui')) AS instructor_jumlah_kursus,
            c.level, c.price, c.strike_price, c.thumbnail_media_id, c.promo_video_media_id, c.language,
            c.durasi_total_menit, c.rating_avg, c.rating_count, c.student_count, c.published_at, c.meta
       FROM courses c
       JOIN categories cat ON cat.id = c.category_id
       JOIN instructor_profiles ip ON ip.id = c.instructor_id
    JOIN users u ON u.id = ip.user_id
      WHERE c.slug = $1 AND c.deleted_at IS NULL AND c.publication_status IN ('terbit','diperbarui')`,
    [slug],
  );
}

export interface PublicCurriculumLesson {
  id: string;
  title: string;
  tipe: string;
  sort_order: number;
  duration_minutes: number | null;
  gratis_preview: boolean;
}

export interface PublicCurriculumSection {
  id: string;
  title: string;
  sort_order: number;
  lessons: PublicCurriculumLesson[];
}

/** Kurikulum ringkas (title seksi/pelajaran saja, tanpa content terproteksi) untuk halaman detail publik. */
export async function publicCurriculum(courseId: string): Promise<PublicCurriculumSection[]> {
  const sections = await query<{ id: string; title: string; sort_order: number }>(
    `SELECT id, title, sort_order FROM sections WHERE course_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC`,
    [courseId],
  );
  const lessons = await query<PublicCurriculumLesson & { section_id: string }>(
    `SELECT l.id, l.title, l.tipe, l.sort_order, l.duration_minutes, l.gratis_preview, l.section_id
       FROM lessons l
       JOIN sections s ON s.id = l.section_id
      WHERE s.course_id = $1 AND l.deleted_at IS NULL
      ORDER BY l.sort_order ASC`,
    [courseId],
  );
  return sections.map((s) => ({
    ...s,
    lessons: lessons
      .filter((l) => l.section_id === s.id)
      .map(({ section_id: _sectionId, ...rest }) => rest),
  }));
}

/** Quiz milik course ini yang belum dihapus — calon ujian akhir. */
export async function quizBelongsToCourse(quizId: string, courseId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM quizzes WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL) AS ok`,
    [quizId, courseId],
  );
  return !!row?.ok;
}

export async function updateCompletionRules(
  id: string,
  fields: { final_exam_quiz_id?: string | null; allow_restart?: boolean },
): Promise<void> {
  const keys = Object.keys(fields) as Array<keyof typeof fields>;
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE courses SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}
