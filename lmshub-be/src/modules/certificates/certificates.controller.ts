import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './certificates.service';
import {
  CreateTemplateInput,
  UpdateTemplateInput,
  ExceptionIssueInput,
  RevokeInput,
  ReissueInput,
  CreateBadgeInput,
  AwardBadgeInput,
  AwardPointsInput,
  LeaderboardSnapshotInput,
} from './certificates.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    user_id: req.query['filter[user_id]'] as string | undefined,
    course_id: req.query['filter[course_id]'] as string | undefined,
    status: req.query['filter[status]'] as string | undefined,
  };
  const { rows, total } = await service.list(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function evaluate(req: Request, res: Response) {
  return ok(res, await service.evaluate(auth(req), req.params.enrollmentId));
}

export async function issue(req: Request, res: Response) {
  return ok(res, await service.issue(auth(req), req.params.id));
}

export async function exceptionIssue(req: Request, res: Response) {
  return created(res, await service.exceptionIssue(auth(req), validated<ExceptionIssueInput>(req)));
}

export async function reissue(req: Request, res: Response) {
  return ok(res, await service.reissue(auth(req), req.params.id, validated<ReissueInput>(req)));
}

export async function revoke(req: Request, res: Response) {
  return ok(res, await service.revoke(auth(req), req.params.id, validated<RevokeInput>(req)));
}

// PUBLIC — tanpa requireAuth
// Self-service siswa: terbitkan sertifikat untuk enrollment miliknya (bila memenuhi syarat).
export async function claim(req: Request, res: Response) {
  return created(res, await service.claim(auth(req), req.params.enrollmentId));
}

// Data lengkap untuk merender desain sertifikat (pemilik/staf).
export async function renderCert(req: Request, res: Response) {
  return ok(res, await service.renderById(auth(req), req.params.id));
}

export async function verify(req: Request, res: Response) {
  return ok(res, await service.verify(req.params.nomor));
}

export async function listTemplates(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listTemplates(page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function createTemplate(req: Request, res: Response) {
  return created(res, await service.createTemplate(auth(req), validated<CreateTemplateInput>(req)));
}

export async function updateTemplate(req: Request, res: Response) {
  return ok(res, await service.updateTemplate(auth(req), req.params.id, validated<UpdateTemplateInput>(req)));
}

export async function deleteTemplate(req: Request, res: Response) {
  await service.deleteTemplate(auth(req), req.params.id);
  return noContent(res);
}

export async function listBadges(req: Request, res: Response) {
  const page = parsePage(req);
  return ok(res, await service.listBadges(page));
}

export async function createBadge(req: Request, res: Response) {
  return created(res, await service.createBadge(auth(req), validated<CreateBadgeInput>(req)));
}

export async function myBadges(req: Request, res: Response) {
  return ok(res, await service.myBadges(auth(req)));
}

export async function awardBadge(req: Request, res: Response) {
  return created(res, await service.awardBadge(auth(req), req.params.id, validated<AwardBadgeInput>(req)));
}

export async function myPoints(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.myPoints(auth(req), page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function awardPoints(req: Request, res: Response) {
  return created(res, await service.awardPoints(auth(req), validated<AwardPointsInput>(req)));
}

export async function leaderboards(req: Request, res: Response) {
  const filters = {
    periode_jenis: req.query['filter[periode_jenis]'] as string | undefined,
    course_id: req.query['filter[course_id]'] as string | undefined,
  };
  return ok(res, await service.leaderboards(filters));
}

export async function generateLeaderboardSnapshot(req: Request, res: Response) {
  return created(res, await service.generateLeaderboardSnapshot(auth(req), validated<LeaderboardSnapshotInput>(req)));
}

export async function myStreak(req: Request, res: Response) {
  return ok(res, await service.myStreak(auth(req)));
}

export async function recordStreakActivity(req: Request, res: Response) {
  return ok(res, await service.recordStreakActivity(auth(req)));
}
