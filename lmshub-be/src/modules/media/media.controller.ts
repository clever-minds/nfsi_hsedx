import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './media.service';
import { CreateMediaInput, UpdateStatusInput } from './media.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    tipe_file: req.query['filter[tipe_file]'] as string | undefined,
    status_transcode: req.query['filter[status_transcode]'] as string | undefined,
    q: req.query.q as string | undefined,
  };
  const { rows, total } = await service.list(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function create(req: Request, res: Response) {
  return created(res, await service.create(auth(req), validated<CreateMediaInput>(req)));
}

export async function updateStatus(req: Request, res: Response) {
  return ok(res, await service.updateStatus(auth(req), req.params.id, validated<UpdateStatusInput>(req)));
}

export async function remove(req: Request, res: Response) {
  await service.remove(auth(req), req.params.id);
  return noContent(res);
}

export async function signedUrl(req: Request, res: Response) {
  return ok(res, await service.signedUrl(auth(req), req.params.id));
}
