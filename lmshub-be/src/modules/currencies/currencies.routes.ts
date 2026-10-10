import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createCurrencySchema, updateCurrencySchema } from './currencies.validation';
import * as ctrl from './currencies.controller';

export const currenciesRouter = Router();

// PUBLIC — price di catalog harus tampil sebelum siapa pun login.
currenciesRouter.get('/public', asyncHandler(ctrl.publicList));

// Master data mengikuti izin `settings`, sama seperti account bank.
currenciesRouter.get('/', requireAuth(), requirePermission('settings', 'view'), asyncHandler(ctrl.list));
currenciesRouter.post(
  '/',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(createCurrencySchema),
  asyncHandler(ctrl.create),
);
currenciesRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(updateCurrencySchema),
  asyncHandler(ctrl.update),
);
currenciesRouter.delete('/:id', requireAuth(), requirePermission('settings', 'update'), asyncHandler(ctrl.remove));
