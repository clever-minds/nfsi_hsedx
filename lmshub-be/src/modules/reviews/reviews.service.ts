import { AppError } from '../../core/http/AppError';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './reviews.repository';
import { UpsertReviewInput } from './reviews.validation';

/** Ringkasan rating + daftar ulasan publik (tanpa auth). */
export async function publicReviews(courseId: string) {
  const [ringkasan, reviews] = await Promise.all([repo.summary(courseId), repo.listPublicReviews(courseId)]);
  return { summary: ringkasan, reviews };
}

/** Ulasan milik sendiri + status kelayakan memberi ulasan. */
export async function myReviewState(actor: AuthContext, courseId: string) {
  const enrollment = await repo.eligibleEnrollment(actor.userId, courseId);
  const review = await repo.myReview(actor.userId, courseId);
  const eligible = !!enrollment && ['aktif', 'selesai'].includes(enrollment.status);
  return {
    eligible,
    alasan: eligible ? null : enrollment ? 'Your enrolment is not active yet' : 'You are not enrolled in this course',
    enrollment_status: enrollment?.status ?? null,
    review,
  };
}

/** Buat/ubah ulasan (satu per enrollment). Hanya siswa aktif/selesai. */
export async function upsert(actor: AuthContext, courseId: string, input: UpsertReviewInput) {
  const enrollment = await repo.eligibleEnrollment(actor.userId, courseId);
  if (!enrollment) throw AppError.forbidden('You are not enrolled in this course', 'enrollment.not_enrolled');
  if (!['aktif', 'selesai'].includes(enrollment.status)) {
    throw AppError.badRequest('You can only review a course you are actively taking or have completed', 'review.enrollment_not_active');
  }
  await repo.upsertReview({
    enrollment_id: enrollment.id,
    user_id: actor.userId,
    course_id: courseId,
    rating: input.rating,
    ulasan: input.ulasan ?? null,
  });
  await repo.recomputeCourseRating(courseId);
  return repo.myReview(actor.userId, courseId);
}
