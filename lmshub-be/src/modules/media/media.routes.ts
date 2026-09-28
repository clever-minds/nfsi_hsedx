import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createMediaSchema, updateStatusSchema } from './media.validation';
import * as ctrl from './media.controller';

export const mediaRouter = Router();

mediaRouter.use(requireAuth());

mediaRouter.get('/', requirePermission('konten', 'view'), asyncHandler(ctrl.list));
mediaRouter.post('/', requirePermission('konten', 'create'), validate(createMediaSchema), asyncHandler(ctrl.create));
mediaRouter.get('/:id', requirePermission('konten', 'view'), asyncHandler(ctrl.detail));
mediaRouter.get('/:id/signed-url', requirePermission('konten', 'view'), asyncHandler(ctrl.signedUrl));
mediaRouter.patch(
  '/:id/status',
  requirePermission('konten', 'update'),
  validate(updateStatusSchema),
  asyncHandler(ctrl.updateStatus),
);
mediaRouter.delete('/:id', requirePermission('konten', 'delete'), asyncHandler(ctrl.remove));
