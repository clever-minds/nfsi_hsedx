import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './curriculum.service';
import {
  CreateContentInput,
  CreateLessonInput,
  CreateSectionInput,
  ReorderLessonsInput,
  ReorderSectionsInput,
  UpdateContentInput,
  UpdateLessonInput,
  UpdateSectionInput,
} from './curriculum.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// ── Sections ─────────────────────────────────────────
export async function listSections(req: Request, res: Response) {
  return ok(res, await service.listSections(auth(req), req.params.courseId));
}

export async function createSection(req: Request, res: Response) {
  return created(res, await service.createSection(auth(req), req.params.courseId, validated<CreateSectionInput>(req)));
}

export async function updateSection(req: Request, res: Response) {
  return ok(res, await service.updateSection(auth(req), req.params.id, validated<UpdateSectionInput>(req)));
}

export async function removeSection(req: Request, res: Response) {
  await service.removeSection(auth(req), req.params.id);
  return noContent(res);
}

export async function reorderSections(req: Request, res: Response) {
  return ok(res, await service.reorderSections(auth(req), req.params.courseId, validated<ReorderSectionsInput>(req)));
}

// ── Lessons ──────────────────────────────────────────
export async function listLessons(req: Request, res: Response) {
  return ok(res, await service.listLessons(auth(req), req.params.sectionId));
}

export async function createLesson(req: Request, res: Response) {
  return created(res, await service.createLesson(auth(req), req.params.sectionId, validated<CreateLessonInput>(req)));
}

export async function updateLesson(req: Request, res: Response) {
  return ok(res, await service.updateLesson(auth(req), req.params.id, validated<UpdateLessonInput>(req)));
}

export async function removeLesson(req: Request, res: Response) {
  await service.removeLesson(auth(req), req.params.id);
  return noContent(res);
}

export async function reorderLessons(req: Request, res: Response) {
  return ok(res, await service.reorderLessons(auth(req), validated<ReorderLessonsInput>(req)));
}

// ── Lesson Contents ──────────────────────────────────
export async function listContents(req: Request, res: Response) {
  return ok(res, await service.listContents(auth(req), req.params.lessonId));
}

export async function createContent(req: Request, res: Response) {
  return created(res, await service.createContent(auth(req), req.params.lessonId, validated<CreateContentInput>(req)));
}

export async function updateContent(req: Request, res: Response) {
  return ok(res, await service.updateContent(auth(req), req.params.id, validated<UpdateContentInput>(req)));
}

export async function removeContent(req: Request, res: Response) {
  await service.removeContent(auth(req), req.params.id);
  return noContent(res);
}
