import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { checkoutSchema, manualOrderSchema, paySchema, refundSchema, verifyPaymentSchema } from './orders.validation';
import * as ctrl from './orders.controller';

export const ordersRouter = Router();

// ── Webhook gateway — PUBLIC (tanpa auth), diverifikasi oleh adapter provider.
// Harus terpasang sebelum requireAuth(), atau seluruh webhook akan dibalas 401. ──
// Mollie mengirim `id=tr_xxx` sebagai form body, bukan JSON — parser urlencoded
// global di app.ts sudah menanganinya.
ordersRouter.post('/webhook/:provider', asyncHandler(ctrl.gatewayWebhook));

ordersRouter.use(requireAuth());

// Konfigurasi gateway untuk FE (client key)
ordersRouter.get('/payment-config', asyncHandler(ctrl.paymentConfig));

// input tanda jadi manual (marketing/admin) — attribution marketing_user_id
ordersRouter.post(
  '/manual',
  requirePermission('transaksi', 'create'),
  validate(manualOrderSchema),
  asyncHandler(ctrl.createManual),
);

ordersRouter.post('/', requirePermission('transaksi', 'create'), validate(checkoutSchema), asyncHandler(ctrl.checkout));
ordersRouter.get('/', requirePermission('transaksi', 'view'), asyncHandler(ctrl.list));
ordersRouter.get('/:id', requirePermission('transaksi', 'view'), asyncHandler(ctrl.detail));
ordersRouter.get('/:id/invoice', requirePermission('pembayaran', 'view'), asyncHandler(ctrl.invoice));

// FINANSIAL — transfer manual/mock, WAJIB withTransaction (lihat orders.service)
ordersRouter.post('/:id/pay', requirePermission('pembayaran', 'create'), validate(paySchema), asyncHandler(ctrl.pay));
// FINANSIAL — mulai pembayaran gateway (settle HANYA lewat webhook)
ordersRouter.post('/:id/pay-gateway', requirePermission('pembayaran', 'create'), asyncHandler(ctrl.payGateway));
// FINANSIAL — verifikasi admin_ops atas transfer manual
ordersRouter.post(
  '/:id/verify',
  requirePermission('pembayaran', 'update'),
  validate(verifyPaymentSchema),
  asyncHandler(ctrl.verify),
);

// FINANSIAL — approval Direktur wajib (dijaga tambahan di service)
ordersRouter.post('/:id/refund', requirePermission('refund', 'update'), validate(refundSchema), asyncHandler(ctrl.refund));
