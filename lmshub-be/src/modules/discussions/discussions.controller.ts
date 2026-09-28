import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './discussions.service';
import {
  CreateThreadInput,
  CreatePostInput,
  PinThreadInput,
  LockThreadInput,
  MarkTerjawabInput,
  CreateQuestionInput,
  CreateAnswerInput,
  CreateCommentInput,
  ToggleReactionInput,
  CreateReportInput,
  ActOnReportInput,
} from './discussions.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function listThreads(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listThreads(auth(req), req.params.courseId, page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function createThread(req: Request, res: Response) {
  return created(res, await service.createThread(auth(req), req.params.courseId, validated<CreateThreadInput>(req)));
}

export async function threadDetail(req: Request, res: Response) {
  return ok(res, await service.threadDetail(auth(req), req.params.id));
}

export async function reply(req: Request, res: Response) {
  return created(res, await service.reply(auth(req), req.params.id, validated<CreatePostInput>(req)));
}

export async function pinThread(req: Request, res: Response) {
  const input = validated<PinThreadInput>(req);
  return ok(res, await service.pinThread(auth(req), req.params.id, input.is_pinned));
}

export async function lockThread(req: Request, res: Response) {
  const input = validated<LockThreadInput>(req);
  return ok(res, await service.lockThread(auth(req), req.params.id, input.is_locked));
}

export async function listQuestions(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listQuestions(auth(req), req.params.lessonId, page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function askQuestion(req: Request, res: Response) {
  return created(res, await service.askQuestion(auth(req), req.params.lessonId, validated<CreateQuestionInput>(req)));
}

export async function answerQuestion(req: Request, res: Response) {
  return created(res, await service.answerQuestion(auth(req), req.params.id, validated<CreateAnswerInput>(req)));
}

export async function markQuestionTerjawab(req: Request, res: Response) {
  const input = validated<MarkTerjawabInput>(req);
  return ok(res, await service.markQuestionTerjawab(auth(req), req.params.id, input.status_terjawab));
}

export async function upvoteQuestion(req: Request, res: Response) {
  return ok(res, await service.upvoteQuestion(auth(req), req.params.id));
}

export async function upvoteAnswer(req: Request, res: Response) {
  return ok(res, await service.upvoteAnswer(auth(req), req.params.id));
}

export async function createComment(req: Request, res: Response) {
  return created(res, await service.createComment(auth(req), validated<CreateCommentInput>(req)));
}

export async function toggleReaction(req: Request, res: Response) {
  return ok(res, await service.toggleReaction(auth(req), validated<ToggleReactionInput>(req)));
}

export async function createReport(req: Request, res: Response) {
  return created(res, await service.createReport(auth(req), validated<CreateReportInput>(req)));
}

export async function listReports(req: Request, res: Response) {
  const page = parsePage(req);
  const status = req.query['filter[status]'] as string | undefined;
  const { rows, total } = await service.listReports(auth(req), page, status);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function actOnReport(req: Request, res: Response) {
  return ok(res, await service.actOnReport(auth(req), req.params.id, validated<ActOnReportInput>(req)));
}
