import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './progress.service';
import { CreateBookmarkInput, CreateNoteInput, UpdateLessonProgressInput, UpdateNoteInput } from './progress.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function updateLessonProgress(req: Request, res: Response) {
  return ok(res, await service.updateLessonProgress(auth(req), req.params.lessonId, validated<UpdateLessonProgressInput>(req)));
}

export async function getCourseProgress(req: Request, res: Response) {
  return ok(res, await service.getCourseProgress(auth(req), req.params.courseId));
}

export async function learnView(req: Request, res: Response) {
  return ok(res, await service.learnView(auth(req), req.params.courseId));
}

export async function listNotes(req: Request, res: Response) {
  return ok(res, await service.listNotes(auth(req), req.params.lessonId));
}

export async function createNote(req: Request, res: Response) {
  return created(res, await service.createNote(auth(req), req.params.lessonId, validated<CreateNoteInput>(req)));
}

export async function updateNote(req: Request, res: Response) {
  return ok(res, await service.updateNote(auth(req), req.params.id, validated<UpdateNoteInput>(req)));
}

export async function removeNote(req: Request, res: Response) {
  await service.removeNote(auth(req), req.params.id);
  return noContent(res);
}

export async function listBookmarks(req: Request, res: Response) {
  return ok(res, await service.listBookmarks(auth(req), req.params.lessonId));
}

export async function createBookmark(req: Request, res: Response) {
  return created(res, await service.createBookmark(auth(req), req.params.lessonId, validated<CreateBookmarkInput>(req)));
}

export async function removeBookmark(req: Request, res: Response) {
  await service.removeBookmark(auth(req), req.params.id);
  return noContent(res);
}
