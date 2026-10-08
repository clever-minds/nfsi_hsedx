import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { validate } from '../../core/validation/validate';
import { upsertReviewSchema } from './reviews.validation';
import * as ctrl from './reviews.controller';

export const reviewsRouter = Router();

// PUBLIK — summary rating + daftar ulasan (dikonsumsi halaman detail course)
reviewsRouter.get('/courses/:courseId/reviews', asyncHandler(ctrl.publicReviews));

// Terproteksi — ulasan milik sendiri & buat/ubah ulasan (student ter-enroll)
reviewsRouter.get('/courses/:courseId/reviews/me', requireAuth(), asyncHandler(ctrl.myReview));
reviewsRouter.post(
  '/courses/:courseId/reviews',
  requireAuth(),
  validate(upsertReviewSchema),
  asyncHandler(ctrl.upsert),
);
