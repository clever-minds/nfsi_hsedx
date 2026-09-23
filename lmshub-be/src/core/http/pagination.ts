import { Request } from 'express';
import { Meta } from './envelope';

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
  sort?: string;
  order: 'ASC' | 'DESC';
}

export function parsePage(req: Request, defaultLimit = 20, maxLimit = 100): PageParams {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  const sort = typeof req.query.sort === 'string' ? req.query.sort.replace(/^-/, '') : undefined;
  const order: 'ASC' | 'DESC' =
    typeof req.query.sort === 'string' && req.query.sort.startsWith('-') ? 'DESC' : 'ASC';
  return { page, limit, offset: (page - 1) * limit, sort, order };
}

export function pageMeta(page: number, limit: number, total: number): Meta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}
