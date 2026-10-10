import { query, queryOne } from '../../core/db/pool';

export interface PublicReviewRow {
  id: string;
  rating: number;
  review: string | null;
  user_name: string;
  user_foto: string | null;
  created_at: string;
}

export interface ReviewSummary {
  rating_avg: number;
  rating_count: number;
  distribusi: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/** register review publik sebuah course (join name & photo penulis). */
export async function listPublicReviews(courseId: string, limit = 50): Promise<PublicReviewRow[]> {
  return query<PublicReviewRow>(
    `SELECT r.id, r.rating, r.review, u.name_lengkap AS user_name, u.profile_picture AS user_foto, r.created_at
       FROM reviews r
       JOIN users u ON u.id = r.user_id
      WHERE r.course_id = $1 AND r.deleted_at IS NULL AND r.is_hidden = false
      ORDER BY r.created_at DESC
      LIMIT ${limit}`,
    [courseId],
  );
}

/** Ringkasan rating: rata-rata, amount, dan distribusi per bintang. */
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
  let amount = 0;
  for (const r of rows) {
    const n = Number(r.n);
    distribusi[String(r.rating) as keyof ReviewSummary['distribusi']] = n;
    total += r.rating * n;
    amount += n;
  }
  return {
    rating_avg: amount ? Math.round((total / amount) * 10) / 10 : 0,
    rating_count: amount,
    distribusi,
  };
}

export interface MyReviewRow {
  id: string;
  rating: number;
  review: string | null;
  created_at: string;
}

/** Enrollment active/finish milik user untuk course (source kelayakan review). */
export async function eligibleEnrollment(
  userId: string,
  courseId: string,
): Promise<{ id: string; status: string } | null> {
  return queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM enrollments
      WHERE user_id = $1 AND course_id = $2 AND deleted_at IS NULL AND status <> 'cancelled'
      ORDER BY created_at DESC LIMIT 1`,
    [userId, courseId],
  );
}

export async function myReview(userId: string, courseId: string): Promise<MyReviewRow | null> {
  return queryOne<MyReviewRow>(
    `SELECT id, rating, review, created_at FROM reviews
      WHERE user_id = $1 AND course_id = $2 AND deleted_at IS NULL`,
    [userId, courseId],
  );
}

/** Upsert satu review per enrollment (unik). */
export async function upsertReview(data: {
  enrollment_id: string;
  user_id: string;
  course_id: string;
  rating: number;
  review: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO reviews (enrollment_id, user_id, course_id, rating, review)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (enrollment_id) WHERE deleted_at IS NULL
       DO UPDATE SET rating = EXCLUDED.rating, review = EXCLUDED.review, updated_at = now()`,
    [data.enrollment_id, data.user_id, data.course_id, data.rating, data.review],
  );
}

/** Sinkronkan agregat courses.rating_avg & rating_count from tabel reviews. */
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
