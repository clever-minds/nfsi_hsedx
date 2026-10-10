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
  changeMyEmailSchema,
  uploadMyPhotoSchema,
} from './users.validation';
import * as ctrl from './users.controller';

export const usersRouter = Router();

usersRouter.use(requireAuth());

// Catalog roles & permissions (untuk UI checklist)
usersRouter.get('/_roles', requirePermission('role', 'view'), asyncHandler(ctrl.roles));
usersRouter.get('/_permissions', requirePermission('role', 'view'), asyncHandler(ctrl.permissionsCatalog));

usersRouter.get('/', requirePermission('users', 'view'), asyncHandler(ctrl.list));
usersRouter.post('/', requirePermission('users', 'create'), validate(createUserSchema), asyncHandler(ctrl.create));

// ── Self-service (profile & password milik sendiri) — WAJIB sebelum '/:id' ──
usersRouter.patch('/me', validate(updateMeSchema), asyncHandler(ctrl.updateMe));
usersRouter.patch('/me/password', validate(changeMyPasswordSchema), asyncHandler(ctrl.changeMyPassword));
usersRouter.patch('/me/email', validate(changeMyEmailSchema), asyncHandler(ctrl.changeMyEmail));
usersRouter.post('/me/photo', validate(uploadMyPhotoSchema), asyncHandler(ctrl.uploadMyPhoto));

usersRouter.get('/:id', requirePermission('users', 'view'), asyncHandler(ctrl.detail));
usersRouter.put('/:id', requirePermission('users', 'update'), validate(updateUserSchema), asyncHandler(ctrl.update));
usersRouter.delete('/:id', requirePermission('users', 'delete'), asyncHandler(ctrl.remove));

usersRouter.get('/:id/permissions', requirePermission('users', 'view'), asyncHandler(ctrl.getPermissions));
usersRouter.put(
  '/:id/permissions',
  requirePermission('users', 'update'),
  validate(setPermissionsSchema),
  asyncHandler(ctrl.setPermissions),
);
usersRouter.post(
  '/:id/verify',
  requirePermission('users', 'update'),
  validate(verifySchema),
  asyncHandler(ctrl.verify),
);
