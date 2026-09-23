import { query, queryOne } from '../../core/db/pool';

export interface PublicReviewRow {
  id: string;
  rating: number;
  ulasan: string | null;
  user_nama: string;
  user_foto: string | null;
  created_at: string;
}

export interface ReviewSummary {
  rating_avg: number;
  rating_count: number;
  distribusi: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** Daftar ulasan publik sebuah kursus (join nama & foto penulis). */
export async function listPublicReviews(courseId: string, limit = 50): Promise<PublicReviewRow[]> {
  return query<PublicReviewRow>(
    `SELECT r.id, r.rating, r.ulasan, u.nama_lengkap AS user_nama, u.foto_profil AS user_foto, r.created_at
       FROM reviews r
       JOIN users u ON u.id = r.user_id
      WHERE r.course_id = $1 AND r.deleted_at IS NULL AND r.is_hidden = false
      ORDER BY r.created_at DESC
      LIMIT ${limit}`,
    [courseId],
  );
}

/** Ringkasan rating: rata-rata, jumlah, dan distribusi per bintang. */
export async function summary(courseId: string): Promise<ReviewSummary> {
  const rows = await query<{ rating: number; n: string }>(
    `SELECT rating, COUNT(*)::int AS n
       FROM reviews
      WHERE course_id = $1 AND deleted_at IS NULL AND is_hidden = false
      GROUP BY rating`,
    [courseId],
  );
  const distribusi = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as ReviewSummary['distribusi'];
  let total = 0;
  let jumlah = 0;
  for (const r of rows) {
    const n = Number(r.n);
    distribusi[String(r.rating) as keyof ReviewSummary['distribusi']] = n;
    total += r.rating * n;
    jumlah += n;
  }
  return {
    rating_avg: jumlah ? Math.round((total / jumlah) * 10) / 10 : 0,
    rating_count: jumlah,
    distribusi,
  };
}

export interface MyReviewRow {
  id: string;
  rating: number;
  ulasan: string | null;
  created_at: string;
}

/** Enrollment aktif/selesai milik user untuk kursus (sumber kelayakan review). */
export async function eligibleEnrollment(
  userId: string,
  courseId: string,
): Promise<{ id: string; status: string } | null> {
  return queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM enrollments
      WHERE user_id = $1 AND course_id = $2 AND deleted_at IS NULL AND status <> 'batal'
      ORDER BY created_at DESC LIMIT 1`,
    [userId, courseId],
  );
}

export async function myReview(userId: string, courseId: string): Promise<MyReviewRow | null> {
  return queryOne<MyReviewRow>(
    `SELECT id, rating, ulasan, created_at FROM reviews
      WHERE user_id = $1 AND course_id = $2 AND deleted_at IS NULL`,
    [userId, courseId],
  );
}

/** Upsert satu ulasan per enrollment (unik). */
export async function upsertReview(data: {
  enrollment_id: string;
  user_id: string;
  course_id: string;
  rating: number;
  ulasan: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO reviews (enrollment_id, user_id, course_id, rating, ulasan)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (enrollment_id) WHERE deleted_at IS NULL
       DO UPDATE SET rating = EXCLUDED.rating, ulasan = EXCLUDED.ulasan, updated_at = now()`,
    [data.enrollment_id, data.user_id, data.course_id, data.rating, data.ulasan],
  );
}

/** Sinkronkan agregat courses.rating_avg & rating_count dari tabel reviews. */
export async function recomputeCourseRating(courseId: string): Promise<void> {
  await query(
    `UPDATE courses SET
       rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews
                               WHERE course_id = $1 AND deleted_at IS NULL AND is_hidden = false), 0),
       rating_count = (SELECT COUNT(*) FROM reviews
                        WHERE course_id = $1 AND deleted_at IS NULL AND is_hidden = false)
     WHERE id = $1`,
    [courseId],
  );
}
