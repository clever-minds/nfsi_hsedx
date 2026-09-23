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
    return fail(res, 409, 'CONFLICT', 'That record already exists', isProd ? undefined : pgErr.detail, 'db.unique_violation');
  }
  if (pgErr?.code === '23503') {
    return fail(res, 409, 'FK_VIOLATION', 'Related record is missing or still in use', isProd ? undefined : pgErr.detail, 'db.foreign_key_violation');
  }

  logger.error({ err }, 'Unhandled error');
  return fail(res, 500, 'INTERNAL', 'Internal server error', isProd ? undefined : String(err), 'http.internal');
}
