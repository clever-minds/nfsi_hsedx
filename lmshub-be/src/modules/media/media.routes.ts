import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createMediaSchema, updateStatusSchema } from './media.validation';
import * as ctrl from './media.controller';

export const mediaRouter = Router();

mediaRouter.use(requireAuth());

mediaRouter.get('/', requirePermission('content', 'view'), asyncHandler(ctrl.list));
mediaRouter.post('/', requirePermission('content', 'create'), validate(createMediaSchema), asyncHandler(ctrl.create));
// Raw file body, streamed to disk — see media.service `upload`.
mediaRouter.post('/upload', requirePermission('content', 'create'), asyncHandler(ctrl.upload));
mediaRouter.get('/:id', requirePermission('content', 'view'), asyncHandler(ctrl.detail));
mediaRouter.get('/:id/signed-url', requirePermission('content', 'view'), asyncHandler(ctrl.signedUrl));
mediaRouter.patch(
  '/:id/status',
  requirePermission('content', 'update'),
  validate(updateStatusSchema),
  asyncHandler(ctrl.updateStatus),
);
mediaRouter.delete('/:id', requirePermission('content', 'delete'), asyncHandler(ctrl.remove));
