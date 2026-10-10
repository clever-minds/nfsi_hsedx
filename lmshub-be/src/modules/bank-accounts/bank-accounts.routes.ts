import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createBankAccountSchema, updateBankAccountSchema } from './bank-accounts.validation';
import * as ctrl from './bank-accounts.controller';

export const bankAccountsRouter = Router();

// PUBLIC — account active untuk instructions transfer di checkout.
bankAccountsRouter.get('/public', asyncHandler(ctrl.publicList));

// Master data managed di bawah izin `settings` (sama dengan layar Settings).
bankAccountsRouter.get('/', requireAuth(), requirePermission('settings', 'view'), asyncHandler(ctrl.list));
bankAccountsRouter.post(
  '/',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(createBankAccountSchema),
  asyncHandler(ctrl.create),
);
bankAccountsRouter.get('/:id', requireAuth(), requirePermission('settings', 'view'), asyncHandler(ctrl.detail));
bankAccountsRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('settings', 'update'),
  validate(updateBankAccountSchema),
  asyncHandler(ctrl.update),
);
bankAccountsRouter.delete(
  '/:id',
  requireAuth(),
  requirePermission('settings', 'update'),
  asyncHandler(ctrl.remove),
);
