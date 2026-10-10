import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { checkoutSchema, manualOrderSchema, paySchema, refundSchema, verifyPaymentSchema } from './orders.validation';
import * as ctrl from './orders.controller';

export const ordersRouter = Router();

// ── Webhook gateway — PUBLIC (tanpa auth), diverifikasi by adapter provider.
// Harus terpasang sebelum requireAuth(), atau seluruh webhook akan dibalas 401. ──
// Mollie mengirim `id=tr_xxx` sebagai form body, bukan JSON — parser urlencoded
// global di app.ts sudah menanganinya.
ordersRouter.post('/webhook/:provider', asyncHandler(ctrl.gatewayWebhook));

// Proxy untuk gateway yang me-redirect pembeli dengan method HTTP POST
// (seperti Easebuzz, PayU). Frontend SPA (Vite/Nginx) akan menolak POST to 
// berkas statis (404/405). Rute ini mencegat POST tersebut dan mengubahnya 
// menjadi GET biasa dengan 302 Redirect.
ordersRouter.post('/redirect', (req, res) => {
  const target = req.query.url as string;
  if (!target || typeof target !== 'string') return res.redirect('/');
  res.redirect(302, target);
});

ordersRouter.use(requireAuth());

// Konfigurasi gateway untuk FE (client key)
ordersRouter.get('/payment-config', asyncHandler(ctrl.paymentConfig));

// input tanda jadi manual (marketing/admin) — attribution marketing_user_id
ordersRouter.post(
  '/manual',
  requirePermission('transaction', 'create'),
  validate(manualOrderSchema),
  asyncHandler(ctrl.createManual),
);

ordersRouter.post('/', requirePermission('transaction', 'create'), validate(checkoutSchema), asyncHandler(ctrl.checkout));
ordersRouter.get('/', requirePermission('transaction', 'view'), asyncHandler(ctrl.list));
ordersRouter.get('/:id', requirePermission('transaction', 'view'), asyncHandler(ctrl.detail));
ordersRouter.get('/:id/invoice', requirePermission('payment', 'view'), asyncHandler(ctrl.invoice));

// FINANSIAL — transfer manual/mock, WAJIB withTransaction (view orders.service)
ordersRouter.post('/:id/pay', requirePermission('payment', 'create'), validate(paySchema), asyncHandler(ctrl.pay));
// FINANSIAL — start payment gateway (settle HANYA lewat webhook)
ordersRouter.post('/:id/pay-gateway', requirePermission('payment', 'create'), asyncHandler(ctrl.payGateway));
// FINANSIAL — verifikasi admin_ops on transfer manual
ordersRouter.post(
  '/:id/verify',
  requirePermission('payment', 'update'),
  validate(verifyPaymentSchema),
  asyncHandler(ctrl.verify),
);

// FINANSIAL — approval Direktur wajib (dijaga tambahan di service)
ordersRouter.post('/:id/refund', requirePermission('refund', 'update'), validate(refundSchema), asyncHandler(ctrl.refund));
