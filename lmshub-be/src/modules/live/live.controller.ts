import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './live.service';
import {
  CreateLiveSessionInput,
  UpdateLiveSessionInput,
  MarkAttendanceInput,
  CreateRecordingInput,
  PublishAsLessonInput,
} from './live.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    course_id: req.query['filter[course_id]'] as string | undefined,
    cohort_id: req.query['filter[cohort_id]'] as string | undefined,
    status: req.query['filter[status]'] as string | undefined,
  };
  const { rows, total } = await service.list(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function schedule(req: Request, res: Response) {
  return created(res, await service.schedule(auth(req), validated<CreateLiveSessionInput>(req)));
}

export async function update(req: Request, res: Response) {
  return ok(res, await service.update(auth(req), req.params.id, validated<UpdateLiveSessionInput>(req)));
}

export async function cancel(req: Request, res: Response) {
  await service.cancel(auth(req), req.params.id);
  return ok(res, { cancelled: true });
}

export async function start(req: Request, res: Response) {
  return ok(res, await service.start(auth(req), req.params.id));
}

export async function end(req: Request, res: Response) {
  return ok(res, await service.end(auth(req), req.params.id));
}

export async function listAttendance(req: Request, res: Response) {
  return ok(res, await service.listAttendance(auth(req), req.params.id));
}

export async function markAttendance(req: Request, res: Response) {
  return ok(res, await service.markAttendance(auth(req), req.params.id, validated<MarkAttendanceInput>(req)));
}

export async function join(req: Request, res: Response) {
  return ok(res, await service.join(auth(req), req.params.id));
}

export async function listRecordings(req: Request, res: Response) {
  return ok(res, await service.listRecordings(auth(req), req.params.liveSessionId));
}

export async function addRecording(req: Request, res: Response) {
  return created(res, await service.addRecording(auth(req), req.params.id, validated<CreateRecordingInput>(req)));
}

export async function publishAsLesson(req: Request, res: Response) {
  const input = validated<PublishAsLessonInput>(req);
  return ok(res, await service.publishAsLesson(auth(req), req.params.id, input.lesson_id));
}

export async function calendar(req: Request, res: Response) {
  const filters = {
    course_id: req.query['filter[course_id]'] as string | undefined,
    from: req.query['filter[from]'] as string | undefined,
    to: req.query['filter[to]'] as string | undefined,
  };
  return ok(res, await service.calendar(auth(req), filters));
}
