import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './categories.service';
import { CreateCategoryInput, CreateTagInput, UpdateCategoryInput, UpdateTagInput } from './categories.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

// ── Categories ───────────────────────────────────────
export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    q: req.query.q as string | undefined,
    is_aktif:
      req.query['filter[is_aktif]'] !== undefined ? req.query['filter[is_aktif]'] === 'true' : undefined,
  };
  const { rows, total } = await service.list(page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

// PUBLIC
export async function publicList(_req: Request, res: Response) {
  return ok(res, await service.publicList());
}

// PUBLIC
export async function publicDetail(req: Request, res: Response) {
  return ok(res, await service.publicDetail(req.params.slug));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(req.params.id));
}

export async function create(req: Request, res: Response) {
  return created(res, await service.create(auth(req), validated<CreateCategoryInput>(req)));
}

export async function update(req: Request, res: Response) {
  return ok(res, await service.update(auth(req), req.params.id, validated<UpdateCategoryInput>(req)));
}

export async function remove(req: Request, res: Response) {
  await service.remove(auth(req), req.params.id);
  return noContent(res);
}

// ── Tags ─────────────────────────────────────────────
export async function tagList(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = { q: req.query.q as string | undefined };
  const { rows, total } = await service.tagList(page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

// PUBLIC
export async function publicTagList(_req: Request, res: Response) {
  return ok(res, await service.publicTagList());
}

export async function tagDetail(req: Request, res: Response) {
  return ok(res, await service.tagDetail(req.params.id));
}

export async function tagCreate(req: Request, res: Response) {
  return created(res, await service.tagCreate(auth(req), validated<CreateTagInput>(req)));
}

export async function tagUpdate(req: Request, res: Response) {
  return ok(res, await service.tagUpdate(auth(req), req.params.id, validated<UpdateTagInput>(req)));
}

export async function tagRemove(req: Request, res: Response) {
  await service.tagRemove(auth(req), req.params.id);
  return noContent(res);
}
