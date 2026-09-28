import { NextFunction, Request, Response } from 'express';
import { AppError } from '../http/AppError';
import { PermissionAction } from './types';
import { can } from './rbacService';

/** Middleware: pastikan req.auth punya permission `module.action`. Pakai setelah requireAuth. */
export function requirePermission(module: string, action: PermissionAction) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!can(req.auth.permissions, `${module}.${action}`)) {
      return next(AppError.forbidden(`This action needs the ${module}.${action} permission`, 'auth.permission_required'));
    }
    next();
  };
}
