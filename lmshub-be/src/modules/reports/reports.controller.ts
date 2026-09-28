import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './reports.service';
import { ApprovePayoutInput, CreateFinancialEntryInput, CreateReviewInput } from './reports.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// ── financial_entries ────────────────────────────────────────────────────

export async function listFinancialEntries(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    jenis: req.query['filter[jenis]'] as 'pemasukan' | 'pengeluaran' | undefined,
    kategori_id: req.query['filter[kategori]'] as string | undefined,
    course_id: req.query['filter[course_id]'] as string | undefined,
    dari: req.query['filter[dari]'] as string | undefined,
    sampai: req.query['filter[sampai]'] as string | undefined,
  };
  const { rows, total } = await service.listFinancialEntries(page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function createFinancialEntry(req: Request, res: Response) {
  return created(res, await service.createFinancialEntry(auth(req), validated<CreateFinancialEntryInput>(req)));
}

// ── laporan ──────────────────────────────────────────────────────────────

export async function cashflow(req: Request, res: Response) {
  const filters = {
    dari: req.query['filter[dari]'] as string | undefined,
    sampai: req.query['filter[sampai]'] as string | undefined,
  };
  return ok(res, await service.cashflow(filters));
}

export async function exportReport(req: Request, res: Response) {
  const filters = {
    dari: req.query['filter[dari]'] as string | undefined,
    sampai: req.query['filter[sampai]'] as string | undefined,
  };
  return ok(res, await service.exportReport(filters));
}

// ── instructor_payouts ───────────────────────────────────────────────────

export async function listPayouts(req: Request, res: Response) {
  const page = parsePage(req);
  const status = req.query['filter[status]'] as string | undefined;
  const { rows, total, totalPending } = await service.listPayouts(auth(req), page, status);
  return ok(res, rows, { ...pageMeta(page.page, page.limit, total), total_pending: totalPending });
}

export async function availablePayout(req: Request, res: Response) {
  return ok(res, await service.availablePayout(auth(req)));
}

export async function requestPayout(req: Request, res: Response) {
  return created(res, await service.requestPayout(auth(req)));
}

export async function approvePayout(req: Request, res: Response) {
  const result = await service.approvePayout(auth(req), req.params.id, validated<ApprovePayoutInput>(req));
  return ok(res, result);
}

export async function payPayout(req: Request, res: Response) {
  const result = await service.payPayout(auth(req), req.params.id);
  return ok(res, result);
}

// ── reviews ──────────────────────────────────────────────────────────────

export async function listCourseReviews(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listCourseReviews(req.params.id, page);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function createReview(req: Request, res: Response) {
  const result = await service.createReview(auth(req), req.params.id, validated<CreateReviewInput>(req));
  return created(res, result);
}
