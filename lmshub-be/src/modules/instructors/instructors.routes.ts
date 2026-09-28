import { Router } from 'express';
import { Request, Response } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { ok } from '../../core/http/envelope';
import { AppError } from '../../core/http/AppError';
import * as repo from './instructors.repository';

export const instructorsRouter = Router();

// PUBLIC — daftar & profil instruktur untuk katalog pra-login (lmshub-fe).
instructorsRouter.get(
  '/public',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 24, 100);
    return ok(res, await repo.publicList(limit));
  }),
);

instructorsRouter.get(
  '/public/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const profil = await repo.publicDetail(req.params.id);
    if (!profil) throw AppError.notFound('Instructor not found', 'instructor.not_found');
    const kursus = await repo.publicCourses(profil.id);
    return ok(res, { ...profil, kursus });
  }),
);
