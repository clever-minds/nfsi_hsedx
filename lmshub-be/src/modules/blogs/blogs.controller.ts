import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { AppError } from '../../core/http/AppError';
import { validated } from '../../core/validation/validate';
import * as service from './blogs.service';
import { CreateBlogInput, ListBlogQuery, UpdateBlogInput } from './blogs.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function listPublic(req: Request, res: Response) {
  const query = (req.query as unknown) as ListBlogQuery;
  const result = await service.listPublicBlogs({
    page: Number(query.page || 1),
    limit: Number(query.limit || 12),
    search: typeof query.search === 'string' ? query.search : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
  });
  return ok(res, result.rows, {
    total: result.total,
    page: Number(query.page || 1),
    limit: Number(query.limit || 12),
  });
}

export async function getPublicDetail(req: Request, res: Response) {
  const post = await service.getPublicBlogDetail(req.params.slug);
  return ok(res, post);
}

export async function listCategories(_req: Request, res: Response) {
  const categories = await service.listCategories();
  return ok(res, categories);
}

export async function listAdmin(req: Request, res: Response) {
  const query = (req.query as unknown) as ListBlogQuery;
  const result = await service.listAdminBlogs({
    page: Number(query.page || 1),
    limit: Number(query.limit || 10),
    search: typeof query.search === 'string' ? query.search : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
    status: typeof query.status === 'string' ? (query.status as any) : undefined,
  });
  return ok(res, result.rows, {
    total: result.total,
    page: Number(query.page || 1),
    limit: Number(query.limit || 10),
  });
}

export async function getAdminDetail(req: Request, res: Response) {
  const post = await service.getAdminBlogDetail(req.params.id);
  return ok(res, post);
}

export async function createAdmin(req: Request, res: Response) {
  const input = validated<CreateBlogInput>(req);
  const post = await service.createAdminBlog(auth(req), input);
  return created(res, post);
}

export async function updateAdmin(req: Request, res: Response) {
  const input = validated<UpdateBlogInput>(req);
  const post = await service.updateAdminBlog(req.params.id, input);
  return ok(res, post);
}

export async function deleteAdmin(req: Request, res: Response) {
  await service.deleteAdminBlog(req.params.id);
  return ok(res, { success: true });
}
