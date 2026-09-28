import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './enrollments.service';
import {
  BulkImportInput,
  CreateCohortInput,
  CreateEnrollmentInput,
  OpenSlotInput,
  RevokeEnrollmentInput,
  TransferEnrollmentInput,
  UpdateCohortInput,
} from './enrollments.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    user_id: req.query['filter[user_id]'] as string | undefined,
    course_id: req.query['filter[course_id]'] as string | undefined,
    cohort_id: req.query['filter[cohort_id]'] as string | undefined,
    status: req.query['filter[status]'] as string | undefined,
    sumber: req.query['filter[sumber]'] as string | undefined,
  };
  const { rows, total } = await service.list(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function create(req: Request, res: Response) {
  return created(res, await service.create(auth(req), validated<CreateEnrollmentInput>(req)));
}

export async function transfer(req: Request, res: Response) {
  return ok(res, await service.transfer(auth(req), req.params.id, validated<TransferEnrollmentInput>(req)));
}

export async function revoke(req: Request, res: Response) {
  return ok(res, await service.revoke(auth(req), req.params.id, validated<RevokeEnrollmentInput>(req)));
}

export async function bulkImport(req: Request, res: Response) {
  return created(res, await service.bulkImport(auth(req), validated<BulkImportInput>(req)));
}

export async function listCohorts(req: Request, res: Response) {
  return ok(res, await service.listCohorts(auth(req), req.params.courseId));
}

export async function createCohort(req: Request, res: Response) {
  return created(res, await service.createCohort(auth(req), req.params.courseId, validated<CreateCohortInput>(req)));
}

export async function updateCohort(req: Request, res: Response) {
  return ok(res, await service.updateCohort(auth(req), req.params.id, validated<UpdateCohortInput>(req)));
}

export async function listCohortMembers(req: Request, res: Response) {
  return ok(res, await service.listCohortMembers(auth(req), req.params.id));
}

export async function listAllCohorts(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listAllCohorts(page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function listCohortWaitlist(req: Request, res: Response) {
  return ok(res, await service.listCohortWaitlist(req.params.id));
}

export async function promoteWaitlistMember(req: Request, res: Response) {
  return ok(res, await service.promoteWaitlistMember(auth(req), req.params.id, req.params.memberId));
}

export async function joinCohort(req: Request, res: Response) {
  return created(res, await service.joinCohort(auth(req), req.params.id));
}

export async function openSlot(req: Request, res: Response) {
  return ok(res, await service.openSlot(auth(req), req.params.id, validated<OpenSlotInput>(req)));
}
