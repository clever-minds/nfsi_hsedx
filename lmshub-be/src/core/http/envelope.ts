import { Response } from 'express';

export interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [k: string]: unknown;
}

export interface Envelope<T> {
  data: T | null;
  meta: Meta | null;
  error: { code: string; message: string; details?: unknown; key?: string } | null;
}

export function ok<T>(res: Response, data: T, meta: Meta | null = null, status = 200): Response {
  const body: Envelope<T> = { data, meta, error: null };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, null, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  /** Translation key, so the client can localise instead of printing `message`. */
  key?: string,
): Response {
  const body: Envelope<null> = { data: null, meta: null, error: { code, message, details, key } };
  return res.status(status).json(body);
}
