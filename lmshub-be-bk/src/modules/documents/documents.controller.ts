import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './documents.service';
import {
  CreatePageInput,
  UpdatePageInput,
  UpdateSettingInput,
  UploadBrandAssetInput,
} from './documents.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// ── content_pages ────────────────────────────────────────────────────────

export async function listPages(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    tipe: req.query['filter[tipe]'] as string | undefined,
    status: req.query['filter[status]'] as string | undefined,
  };
  const { rows, total } = await service.listPages(page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

// PUBLIC — halaman statis terbit (tentang/FAQ/kebijakan), tanpa requireAuth
export async function getPublicPage(req: Request, res: Response) {
  return ok(res, await service.getPublicPage(req.params.slug));
}

export async function createPage(req: Request, res: Response) {
  return created(res, await service.createPage(auth(req), validated<CreatePageInput>(req)));
}

export async function updatePage(req: Request, res: Response) {
  return ok(res, await service.updatePage(auth(req), req.params.id, validated<UpdatePageInput>(req)));
}

// ── settings ─────────────────────────────────────────────────────────────

export async function listSettings(_req: Request, res: Response) {
  return ok(res, await service.listSettings());
}

// PUBLIC
export async function publicSettings(_req: Request, res: Response) {
  return ok(res, await service.publicSettings());
}

export async function uploadBrandAsset(req: Request, res: Response) {
  return ok(res, await service.uploadBrandAsset(auth(req), validated<UploadBrandAssetInput>(req)));
}

export async function removeBrandAsset(req: Request, res: Response) {
  const jenis = req.params.jenis as UploadBrandAssetInput['jenis'];
  if (jenis !== 'logo' && jenis !== 'icon') throw AppError.badRequest('Unknown asset type', 'upload.unknown_asset_type');
  return ok(res, await service.removeBrandAsset(auth(req), jenis));
}

export async function updateSetting(req: Request, res: Response) {
  const result = await service.updateSetting(auth(req), req.params.key, validated<UpdateSettingInput>(req));
  return ok(res, result);
}

// ── audit_log ────────────────────────────────────────────────────────────

export async function listAuditLog(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    modul: req.query['filter[module]'] as string | undefined,
    userId: req.query['filter[user_id]'] as string | undefined,
    dari: req.query['filter[dari]'] as string | undefined,
    sampai: req.query['filter[sampai]'] as string | undefined,
  };
  const { rows, total } = await service.listAuditLog(page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

/** Metadata gateway pembayaran (label, status, URL webhook) untuk layar Pengaturan. */
export async function paymentGateways(_req: Request, res: Response) {
  return ok(res, await service.paymentGateways());
}
