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
 * Rute publik from modul ini, dipisah karena sort_order mounting.
 *
 * Beberapa router yang di-mount di root (`curriculum`, `progress`, …) memasang
 * `requireAuth()` untuk SELURUH request yang melewatinya. Karena `documentsRouter`
 * dipasang setelah mereka, rute tanpa auth di bawah ini no akan pernah
 * tercapai — jadi harus dipasang lebih awal di routes.ts.
 */
export const publicDocumentsRouter = Router();

// PUBLIC — register halaman publish (slug, title, penempatan footer), tanpa isinya
publicDocumentsRouter.get('/public/pages', asyncHandler(ctrl.listPublicPages));

// PUBLIC — halaman statis (tentang/FAQ/kebijakan) untuk area pra-login, hanya status='publish'
publicDocumentsRouter.get('/pages/:slug', asyncHandler(ctrl.getPublicPage));

// PUBLIC — setting bertanda is_public (mata uang, kontak, name lembaga)
publicDocumentsRouter.get('/settings/public', asyncHandler(ctrl.publicSettings));

// content_pages — admin CRUD. Izin `settings`, sama dengan menu Website:
// halaman ini tampil untuk semua pengunjung (Terms, Privacy, …). `content`
// dulu dipakai di sini, padahal izin itu juga dimiliki instructor untuk Media
// Library — artinya setiap instructor bisa menulis ulang halaman kebijakan situs.
documentsRouter.get('/pages', requireAuth(), requirePermission('settings', 'view'), asyncHandler(ctrl.listPages));
documentsRouter.post(
  '/pages',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(createPageSchema),
  asyncHandler(ctrl.createPage),
);
documentsRouter.put(
  '/pages/:id',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(updatePageSchema),
  asyncHandler(ctrl.updatePage),
);

documentsRouter.delete(
  '/pages/:id',
  requireAuth(),
  requirePermission('settings', 'update'),
  asyncHandler(ctrl.removePage),
);

// settings — konfigurasi global (permission `settings`)
documentsRouter.get(
  '/settings',
  requireAuth(),
  requirePermission('settings', 'view'),
  asyncHandler(ctrl.listSettings),
);
// Metadata gateway payment. Sama seperti brand-asset: harus sebelum
// '/settings/:key', atau 'payment-gateways' tertangkap sebagai name setting.
documentsRouter.get(
  '/settings/payment-gateways',
  requirePermission('settings', 'view'),
  asyncHandler(ctrl.paymentGateways),
);

// Aset merek — didaftarkan sebelum '/settings/:key' agar 'brand-asset' no
// tertangkap sebagai name key setting.
documentsRouter.post(
  '/settings/brand-asset',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(uploadBrandAssetSchema),
  asyncHandler(ctrl.uploadBrandAsset),
);
documentsRouter.delete(
  '/settings/brand-asset/:type',
  requireAuth(),
  requirePermission('settings', 'update'),
  asyncHandler(ctrl.removeBrandAsset),
);

documentsRouter.put(
  '/settings/:key',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(updateSettingSchema),
  asyncHandler(ctrl.updateSetting),
);

// audit_log — viewer read-only (permission `audit`)
documentsRouter.get('/audit', requireAuth(), requirePermission('audit', 'view'), asyncHandler(ctrl.listAuditLog));
