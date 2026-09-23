import { Request, Response } from 'express';
import { ok, created, noContent } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './courses.service';
import { ArchiveCourseInput, CreateCourseInput, PublishCourseInput, UpdateCourseInput } from './courses.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    status: req.query['filter[status]'] as string | undefined,
    category_id: req.query['filter[category_id]'] as string | undefined,
    instructor_id: req.query['filter[instructor_id]'] as string | undefined,
    level: req.query['filter[level]'] as string | undefined,
    q: req.query.q as string | undefined,
  };
  const { rows, total } = await service.list(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function create(req: Request, res: Response) {
  return created(res, await service.create(auth(req), validated<CreateCourseInput>(req)));
}

export async function update(req: Request, res: Response) {
  return ok(res, await service.update(auth(req), req.params.id, validated<UpdateCourseInput>(req)));
}

export async function remove(req: Request, res: Response) {
  await service.remove(auth(req), req.params.id);
  return noContent(res);
}

export async function submit(req: Request, res: Response) {
  return ok(res, await service.submit(auth(req), req.params.id));
}

export async function publish(req: Request, res: Response) {
  return ok(res, await service.publish(auth(req), req.params.id, validated<PublishCourseInput>(req)));
}

export async function archive(req: Request, res: Response) {
  return ok(res, await service.archive(auth(req), req.params.id, validated<ArchiveCourseInput>(req)));
}

// PUBLIC
export async function publicList(req: Request, res: Response) {
  const page = parsePage(req);
  const filters = {
    category_slug: req.query['filter[kategori]'] as string | undefined,
    level: req.query['filter[level]'] as string | undefined,
    harga_min:
      req.query['filter[harga_min]'] !== undefined ? Number(req.query['filter[harga_min]']) : undefined,
    harga_max:
      req.query['filter[harga_max]'] !== undefined ? Number(req.query['filter[harga_max]']) : undefined,
    q: req.query.q as string | undefined,
  };
  const { rows, total } = await service.publicList(page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

// PUBLIC
export async function publicDetail(req: Request, res: Response) {
  return ok(res, await service.publicDetail(req.params.slug));
}
