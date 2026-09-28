import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createCouponSchema, updateCouponSchema } from './coupons.validation';
import * as ctrl from './coupons.controller';

export const couponsRouter = Router();

// Izin memakai modul 'marketing': kupon adalah alat promosi, dan peran yang
// sudah boleh menjalankan promo (admin_ops, marketing, direktur) otomatis
// kebagian tanpa perlu modul izin baru.
couponsRouter.use(requireAuth());

couponsRouter.get('/', requirePermission('marketing', 'view'), asyncHandler(ctrl.list));
couponsRouter.post('/', requirePermission('marketing', 'create'), validate(createCouponSchema), asyncHandler(ctrl.create));
couponsRouter.get('/:id', requirePermission('marketing', 'view'), asyncHandler(ctrl.detail));
couponsRouter.put('/:id', requirePermission('marketing', 'update'), validate(updateCouponSchema), asyncHandler(ctrl.update));
couponsRouter.delete('/:id', requirePermission('marketing', 'delete'), asyncHandler(ctrl.remove));
