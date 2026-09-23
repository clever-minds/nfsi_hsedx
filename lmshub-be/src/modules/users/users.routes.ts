import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createUserSchema,
  updateUserSchema,
  setPermissionsSchema,
  verifySchema,
  updateMeSchema,
  changeMyPasswordSchema,
  uploadMyPhotoSchema,
} from './users.validation';
import * as ctrl from './users.controller';

export const usersRouter = Router();

usersRouter.use(requireAuth());

// Katalog roles & permissions (untuk UI checklist)
usersRouter.get('/_roles', requirePermission('role', 'view'), asyncHandler(ctrl.roles));
usersRouter.get('/_permissions', requirePermission('role', 'view'), asyncHandler(ctrl.permissionsCatalog));

usersRouter.get('/', requirePermission('pengguna', 'view'), asyncHandler(ctrl.list));
usersRouter.post('/', requirePermission('pengguna', 'create'), validate(createUserSchema), asyncHandler(ctrl.create));

// ── Self-service (profil & password milik sendiri) — WAJIB sebelum '/:id' ──
usersRouter.patch('/me', validate(updateMeSchema), asyncHandler(ctrl.updateMe));
usersRouter.patch('/me/password', validate(changeMyPasswordSchema), asyncHandler(ctrl.changeMyPassword));
usersRouter.post('/me/photo', validate(uploadMyPhotoSchema), asyncHandler(ctrl.uploadMyPhoto));

usersRouter.get('/:id', requirePermission('pengguna', 'view'), asyncHandler(ctrl.detail));
usersRouter.put('/:id', requirePermission('pengguna', 'update'), validate(updateUserSchema), asyncHandler(ctrl.update));
usersRouter.delete('/:id', requirePermission('pengguna', 'delete'), asyncHandler(ctrl.remove));

usersRouter.get('/:id/permissions', requirePermission('pengguna', 'view'), asyncHandler(ctrl.getPermissions));
usersRouter.put(
  '/:id/permissions',
  requirePermission('pengguna', 'update'),
  validate(setPermissionsSchema),
  asyncHandler(ctrl.setPermissions),
);
usersRouter.post(
  '/:id/verify',
  requirePermission('pengguna', 'update'),
  validate(verifySchema),
  asyncHandler(ctrl.verify),
);
