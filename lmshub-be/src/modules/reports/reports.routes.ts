import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { approvePayoutSchema, createFinancialEntrySchema } from './reports.validation';
import * as ctrl from './reports.controller';

export const reportsRouter = Router();

reportsRouter.use(requireAuth());

// Entri keuangan
reportsRouter.get('/financial-entries', requirePermission('keuangan', 'view'), asyncHandler(ctrl.listFinancialEntries));
reportsRouter.post(
  '/financial-entries',
  requirePermission('keuangan', 'create'),
  validate(createFinancialEntrySchema),
  asyncHandler(ctrl.createFinancialEntry),
);

// Laporan arus kas & laba per periode + ekspor (stub JSON)
reportsRouter.get('/reports/cashflow', requirePermission('laporan', 'view'), asyncHandler(ctrl.cashflow));
reportsRouter.get('/reports/export', requirePermission('laporan', 'view'), asyncHandler(ctrl.exportReport));

// Payout instruktur — approve HANYA Direktur
reportsRouter.get('/payouts', requirePermission('payout', 'view'), asyncHandler(ctrl.listPayouts));
// Saldo tersedia & pengajuan pencairan oleh instruktur sendiri (scope via instructor_profile).
reportsRouter.get('/payouts/available', requirePermission('payout', 'view'), asyncHandler(ctrl.availablePayout));
reportsRouter.post('/payouts/request', requirePermission('payout', 'view'), asyncHandler(ctrl.requestPayout));
reportsRouter.post(
  '/payouts/:id/approve',
  requirePermission('payout', 'update'),
  validate(approvePayoutSchema),
  asyncHandler(ctrl.approvePayout),
);
// FINANSIAL — pencairan payout yang sudah disetujui (izin sama dgn approve)
reportsRouter.post('/payouts/:id/pay', requirePermission('payout', 'update'), asyncHandler(ctrl.payPayout));

// Rating & ulasan kursus dipindah ke modul `reviews` (publik + upsert oleh siswa ter-enroll).
