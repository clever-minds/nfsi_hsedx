import { Request, Response } from 'express';
import { ok } from '../../core/http/envelope';
import { AppError } from '../../core/http/AppError';
import { validated } from '../../core/validation/validate';
import * as service from './site-content.service';
import { isSiteContentKey } from './site-content.defaults';
import { UploadSiteAssetInput } from './site-content.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

/** PUBLIC — dibaca setiap kali halaman depan dimuat. */
export async function getAll(_req: Request, res: Response) {
  return ok(res, await service.getAll());
}

export async function updateBlock(req: Request, res: Response) {
  const key = req.params.key;
  if (!isSiteContentKey(key)) throw AppError.notFound('Unknown content block', 'site_content.unknown_block');
  // Blok berupa daftar dikirim sebagai array telanjang; yang lain sebagai objek.
  const body = Array.isArray(req.body) ? req.body : (req.body?.nilai ?? req.body);
  return ok(res, await service.updateBlock(auth(req), key, body));
}

export async function uploadAsset(req: Request, res: Response) {
  const input = validated<UploadSiteAssetInput>(req);
  return ok(res, await service.uploadAsset(auth(req), input));
}

export async function removeAsset(req: Request, res: Response) {
  const jenis = req.params.jenis;
  if (jenis !== 'hero') throw AppError.notFound('Unknown asset', 'media.unknown_asset');
  return ok(res, await service.removeAsset(auth(req), jenis));
}
