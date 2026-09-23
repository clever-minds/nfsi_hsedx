import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './marketing.service';
import {
  ApproveCommissionInput,
  CreateLeadInput,
  CreateReferralLinkInput,
  DisburseCommissionInput,
  MoveStageInput,
  RegisterAffiliateInput,
  TargetOverrideInput,
  VerifyAffiliateInput,
} from './marketing.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// ── Affiliates ────────────────────────────────────────────

export async function registerAffiliate(req: Request, res: Response) {
  return created(res, await service.registerAffiliate(auth(req), validated<RegisterAffiliateInput>(req)));
}

export async function me(req: Request, res: Response) {
  return ok(res, await service.me(auth(req)));
}

export async function listAffiliates(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.list(auth(req), page, {
    status_verifikasi: req.query['filter[status_verifikasi]'] as string | undefined,
  });
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function affiliateDetail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function verifyAffiliate(req: Request, res: Response) {
  return ok(res, await service.verifyAffiliate(auth(req), req.params.id, validated<VerifyAffiliateInput>(req)));
}

export async function overrideTarget(req: Request, res: Response) {
  return ok(res, await service.overrideTarget(auth(req), req.params.id, validated<TargetOverrideInput>(req)));
}

// ── Dashboard & leaderboard ─────────────────────────────────

export async function dashboard(req: Request, res: Response) {
  return ok(res, await service.dashboard(auth(req)));
}

export async function leaderboard(req: Request, res: Response) {
  return ok(res, await service.leaderboard());
}

// ── Referral links ────────────────────────────────────────

export async function createReferralLink(req: Request, res: Response) {
  return created(res, await service.createReferralLink(auth(req), validated<CreateReferralLinkInput>(req)));
}

export async function listReferralLinks(req: Request, res: Response) {
  return ok(res, await service.listReferralLinks(auth(req)));
}

// ── Leads ─────────────────────────────────────────────────

export async function listLeads(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listLeads(auth(req), page, {
    tahap: req.query['filter[tahap]'] as string | undefined,
  });
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function leadDetail(req: Request, res: Response) {
  return ok(res, await service.leadDetail(auth(req), req.params.id));
}

export async function createLead(req: Request, res: Response) {
  return created(res, await service.createLead(auth(req), validated<CreateLeadInput>(req)));
}

export async function moveLeadStage(req: Request, res: Response) {
  return ok(res, await service.moveLeadStage(auth(req), req.params.id, validated<MoveStageInput>(req)));
}

// ── Commissions ───────────────────────────────────────────

export async function listCommissions(req: Request, res: Response) {
  const page = parsePage(req);
  const { rows, total } = await service.listCommissions(auth(req), page, {
    status: req.query['filter[status]'] as string | undefined,
  });
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function commissionDetail(req: Request, res: Response) {
  return ok(res, await service.commissionDetail(auth(req), req.params.id));
}

export async function submitCommission(req: Request, res: Response) {
  return ok(res, await service.submitCommission(auth(req), req.params.id));
}

export async function approveCommission(req: Request, res: Response) {
  return ok(res, await service.approveCommission(auth(req), req.params.id, validated<ApproveCommissionInput>(req)));
}

export async function disburseCommission(req: Request, res: Response) {
  return ok(res, await service.disburseCommission(auth(req), req.params.id, validated<DisburseCommissionInput>(req)));
}
