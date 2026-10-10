import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { uploadSiteAssetSchema } from './site-content.validation';
import * as ctrl from './site-content.controller';

export const siteContentRouter = Router();

/**
 * Dibaca tanpa autentikasi: halaman depan menggambar dirinya from sini,
 * termasuk untuk pengunjung yang belum login.
 */
siteContentRouter.get('/', asyncHandler(ctrl.getAll));

// Perubahan memakai izin yang sama dengan layar settings.
siteContentRouter.post(
  '/asset',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(uploadSiteAssetSchema),
  asyncHandler(ctrl.uploadAsset),
);
// Gambar hero sebagai byte mentah (≤5MB), dialirkan to disk — sama seperti Media Library.
siteContentRouter.post(
  '/asset/hero/upload',
  requireAuth(),
  requirePermission('settings', 'update'),
  asyncHandler(ctrl.uploadHero),
);
siteContentRouter.delete(
  '/asset/:type',
  requireAuth(),
  requirePermission('settings', 'update'),
  asyncHandler(ctrl.removeAsset),
);
siteContentRouter.put(
  '/:key',
  requireAuth(),
  requirePermission('settings', 'update'),
  asyncHandler(ctrl.updateBlock),
);
