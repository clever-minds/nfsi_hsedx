import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createPageSchema,
  updatePageSchema,
  updateSettingSchema,
  uploadBrandAssetSchema,
} from './documents.validation';
import * as ctrl from './documents.controller';

export const documentsRouter = Router();

/**
 * Rute publik dari modul ini, dipisah karena urutan mounting.
 *
 * Beberapa router yang di-mount di root (`curriculum`, `progress`, …) memasang
 * `requireAuth()` untuk SELURUH request yang melewatinya. Karena `documentsRouter`
 * dipasang setelah mereka, rute tanpa auth di bawah ini tidak akan pernah
 * tercapai — jadi harus dipasang lebih awal di routes.ts.
 */
export const publicDocumentsRouter = Router();

// PUBLIC — halaman statis (tentang/FAQ/kebijakan) untuk area pra-login, hanya status='terbit'
publicDocumentsRouter.get('/pages/:slug', asyncHandler(ctrl.getPublicPage));

// PUBLIC — setting bertanda is_public (mata uang, kontak, nama lembaga)
publicDocumentsRouter.get('/settings/public', asyncHandler(ctrl.publicSettings));

// content_pages — admin CRUD (permission `konten`)
documentsRouter.get('/pages', requireAuth(), requirePermission('konten', 'view'), asyncHandler(ctrl.listPages));
documentsRouter.post(
  '/pages',
  requireAuth(),
  requirePermission('konten', 'create'),
  validate(createPageSchema),
  asyncHandler(ctrl.createPage),
);
documentsRouter.put(
  '/pages/:id',
  requireAuth(),
  requirePermission('konten', 'update'),
  validate(updatePageSchema),
  asyncHandler(ctrl.updatePage),
);

// settings — konfigurasi global (permission `pengaturan`)
documentsRouter.get(
  '/settings',
  requireAuth(),
  requirePermission('pengaturan', 'view'),
  asyncHandler(ctrl.listSettings),
);
// Metadata gateway pembayaran. Sama seperti brand-asset: harus sebelum
// '/settings/:key', atau 'payment-gateways' tertangkap sebagai nama setting.
documentsRouter.get(
  '/settings/payment-gateways',
  requirePermission('pengaturan', 'view'),
  asyncHandler(ctrl.paymentGateways),
);

// Aset merek — didaftarkan sebelum '/settings/:key' agar 'brand-asset' tidak
// tertangkap sebagai nama key setting.
documentsRouter.post(
  '/settings/brand-asset',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  validate(uploadBrandAssetSchema),
  asyncHandler(ctrl.uploadBrandAsset),
);
documentsRouter.delete(
  '/settings/brand-asset/:jenis',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  asyncHandler(ctrl.removeBrandAsset),
);

documentsRouter.put(
  '/settings/:key',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  validate(updateSettingSchema),
  asyncHandler(ctrl.updateSetting),
);

// audit_log — viewer read-only (permission `audit`)
documentsRouter.get('/audit', requireAuth(), requirePermission('audit', 'view'), asyncHandler(ctrl.listAuditLog));
