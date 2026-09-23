import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './bank-accounts.service';
import { CreateBankAccountInput, UpdateBankAccountInput } from './bank-accounts.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    q: req.query.q as string | undefined,
    is_aktif: req.query['filter[is_aktif]'] !== undefined ? req.query['filter[is_aktif]'] === 'true' : undefined,
  };
  const { rows, total } = await service.list(page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

// PUBLIC — dipakai layar checkout transfer manual.
export async function publicList(_req: Request, res: Response) {
  return ok(res, await service.publicList());
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(req.params.id));
}

export async function create(req: Request, res: Response) {
  return created(res, await service.create(auth(req), validated<CreateBankAccountInput>(req)));
}

export async function update(req: Request, res: Response) {
  return ok(res, await service.update(auth(req), req.params.id, validated<UpdateBankAccountInput>(req)));
}

export async function remove(req: Request, res: Response) {
  await service.remove(auth(req), req.params.id);
  return noContent(res);
}
