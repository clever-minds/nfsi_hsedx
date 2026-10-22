import { NextFunction, Request, Response } from 'express';
import { AppError } from './AppError';
import { fail } from './envelope';
import { logger } from '../logger/logger';
import { isProd } from '../config/env';

export function notFoundHandler(req: Request, res: Response) {
  return fail(res, 404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`, undefined, 'http.route_not_found');
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err }, err.message);
    return fail(res, err.status, err.code, err.message, err.details, err.key);
  }

  // Postgres unique violation
  const pgErr = err as { code?: string; detail?: string };
  if (pgErr?.code === '23505') {
    const msg = pgErr.detail ? `That record already exists (${pgErr.detail})` : 'That record already exists';
    return fail(res, 409, 'CONFLICT', msg, { detail: pgErr.detail }, 'db.unique_violation');
  }
  if (pgErr?.code === '23503') {
    const msg = pgErr.detail ? `Related record is missing or still in use (${pgErr.detail})` : 'Related record is missing or still in use';
    return fail(res, 409, 'FK_VIOLATION', msg, { detail: pgErr.detail }, 'db.foreign_key_violation');
  }

  logger.error({ err }, 'Unhandled error');
  return fail(res, 500, 'INTERNAL', 'Internal server error', isProd ? undefined : String(err), 'http.internal');
}
