import { Request, Response } from 'express';
import { created, ok } from '../../core/http/envelope';
import { AppError } from '../../core/http/AppError';
import { validated } from '../../core/validation/validate';
import * as service from './currencies.service';
import type { CreateCurrencyInput, UpdateCurrencyInput } from './currencies.validation';

/** Konteks aktor; router sudah memasang requireAuth, ini penjaga tipenya. */
function auth(req: Request) {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
}

/** Active currencies + rates. Public: the storefront prices courses before anyone signs in. */
export async function publicList(_req: Request, res: Response) {
  return ok(res, await service.publicList());
}

export async function list(_req: Request, res: Response) {
  return ok(res, await service.list());
}

export async function create(req: Request, res: Response) {
  return created(res, await service.create(auth(req), validated<CreateCurrencyInput>(req)));
}

export async function update(req: Request, res: Response) {
  return ok(res, await service.update(auth(req), req.params.id, validated<UpdateCurrencyInput>(req)));
}

export async function remove(req: Request, res: Response) {
  return ok(res, await service.remove(auth(req), req.params.id));
}
