import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { uploadSiteAssetSchema } from './site-content.validation';
import * as ctrl from './site-content.controller';

export const siteContentRouter = Router();

/**
 * Dibaca tanpa autentikasi: halaman depan menggambar dirinya dari sini,
 * termasuk untuk pengunjung yang belum login.
 */
siteContentRouter.get('/', asyncHandler(ctrl.getAll));

// Perubahan memakai izin yang sama dengan layar Pengaturan.
siteContentRouter.post(
  '/asset',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  validate(uploadSiteAssetSchema),
  asyncHandler(ctrl.uploadAsset),
);
siteContentRouter.delete(
  '/asset/:jenis',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  asyncHandler(ctrl.removeAsset),
);
siteContentRouter.put(
  '/:key',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  asyncHandler(ctrl.updateBlock),
);
