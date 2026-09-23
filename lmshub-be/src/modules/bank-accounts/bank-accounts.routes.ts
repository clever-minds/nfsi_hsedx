import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createBankAccountSchema, updateBankAccountSchema } from './bank-accounts.validation';
import * as ctrl from './bank-accounts.controller';

export const bankAccountsRouter = Router();

// PUBLIC — rekening aktif untuk instruksi transfer di checkout.
bankAccountsRouter.get('/public', asyncHandler(ctrl.publicList));

// Master data dikelola di bawah izin `pengaturan` (sama dengan layar Settings).
bankAccountsRouter.get('/', requireAuth(), requirePermission('pengaturan', 'view'), asyncHandler(ctrl.list));
bankAccountsRouter.post(
  '/',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  validate(createBankAccountSchema),
  asyncHandler(ctrl.create),
);
bankAccountsRouter.get('/:id', requireAuth(), requirePermission('pengaturan', 'view'), asyncHandler(ctrl.detail));
bankAccountsRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  validate(updateBankAccountSchema),
  asyncHandler(ctrl.update),
);
bankAccountsRouter.delete(
  '/:id',
  requireAuth(),
  requirePermission('pengaturan', 'update'),
  asyncHandler(ctrl.remove),
);
