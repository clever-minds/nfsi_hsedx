import { Request, Response } from 'express';
import { ok } from '../../core/http/envelope';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './reviews.service';
import { UpsertReviewInput } from './reviews.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function publicReviews(req: Request, res: Response) {
  return ok(res, await service.publicReviews(req.params.courseId));
}

export async function myReview(req: Request, res: Response) {
  return ok(res, await service.myReviewState(auth(req), req.params.courseId));
}

export async function upsert(req: Request, res: Response) {
  return ok(res, await service.upsert(auth(req), req.params.courseId, validated<UpsertReviewInput>(req)));
}
