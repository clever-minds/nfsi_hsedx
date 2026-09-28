import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createCurrencySchema, updateCurrencySchema } from './currencies.validation';
import * as ctrl from './currencies.controller';

export const currenciesRouter = Router();

// PUBLIC — harga di katalog harus tampil sebelum siapa pun masuk.
currenciesRouter.get('/public', asyncHandler(ctrl.publicList));

// Master data mengikuti izin `pengaturan`, sama seperti rekening bank.
currenciesRouter.get('/', requireAuth(), requirePermission('pengaturan', 'view'), asyncHandler(ctrl.list));
currenciesRouter.post(
  '/',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  validate(createCurrencySchema),
  asyncHandler(ctrl.create),
);
currenciesRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  validate(updateCurrencySchema),
  asyncHandler(ctrl.update),
);
currenciesRouter.delete('/:id', requireAuth(), requirePermission('pengaturan', 'update'), asyncHandler(ctrl.remove));
