import { Request, Response } from 'express';
import { ok } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './grading.service';
import { AdjustGradeInput, GradeSubmissionInput, ReleaseGradeInput, RequestRevisionInput } from './grading.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// Peta nilai filter ramah-UI → enum submission_status.
const STATUS_MAP: Record<string, string | undefined> = {
  menunggu_penilaian: 'dikumpulkan',
  menunggu: 'dikumpulkan',
  dikumpulkan: 'dikumpulkan',
  dinilai: 'dinilai',
  revisi: 'revisi_diminta',
  revisi_diminta: 'revisi_diminta',
  belum: 'belum',
  semua: undefined,
  '': undefined,
};

export async function listSubmissions(req: Request, res: Response) {
  const page = parsePage(req);
  const raw = ((req.query['filter[status]'] ?? req.query.status) as string | undefined) || '';
  const status = raw in STATUS_MAP ? STATUS_MAP[raw] : raw || undefined;
  const { rows, total } = await service.listSubmissions(auth(req), page, { status });
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function getSubmissionGrade(req: Request, res: Response) {
  return ok(res, await service.getSubmissionGrade(auth(req), req.params.id));
}

export async function gradeSubmission(req: Request, res: Response) {
  return ok(res, await service.manualGradeSubmission(auth(req), req.params.id, validated<GradeSubmissionInput>(req)));
}

export async function requestRevision(req: Request, res: Response) {
  return ok(res, await service.requestRevision(auth(req), req.params.id, validated<RequestRevisionInput>(req)));
}

export async function releaseGrade(req: Request, res: Response) {
  return ok(res, await service.releaseGrade(auth(req), req.params.id, validated<ReleaseGradeInput>(req)));
}

export async function adjustGrade(req: Request, res: Response) {
  return ok(res, await service.adjustGrade(auth(req), req.params.id, validated<AdjustGradeInput>(req)));
}

export async function getGradebook(req: Request, res: Response) {
  return ok(res, await service.getGradebook(auth(req), req.params.courseId));
}
