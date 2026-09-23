import { NextFunction, Request, Response } from 'express';
import { AppError } from '../http/AppError';
import { verifyAccessToken } from '../auth/jwt';
import { loadEffectivePermissions } from './rbacService';

/** Middleware: verifikasi Bearer access token + muat permission efektif ke req.auth. */
export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw AppError.unauthorized('No authentication token was provided', 'auth.token_missing');
      const token = header.slice(7);
      const payload = verifyAccessToken(token);
      const permissions = await loadEffectivePermissions(payload.sub);
      req.auth = {
        userId: payload.sub,
        role: payload.role,
        roles: payload.roles ?? [payload.role],
        permissions,
      };
      next();
    } catch (err) {
      if (err instanceof AppError) return next(err);
      return next(AppError.unauthorized('That token is invalid or has expired', 'auth.token_invalid'));
    }
  };
}
