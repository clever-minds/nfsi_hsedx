import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  approveCommissionSchema,
  createLeadSchema,
  createReferralLinkSchema,
  disburseCommissionSchema,
  moveStageSchema,
  registerAffiliateSchema,
  targetOverrideSchema,
  verifyAffiliateSchema,
} from './marketing.validation';
import * as ctrl from './marketing.controller';

export const marketingRouter = Router();

marketingRouter.use(requireAuth());

// ── Dashboard & leaderboard ──────────────────────────────────
marketingRouter.get('/dashboard', requirePermission('marketing', 'view'), asyncHandler(ctrl.dashboard));
marketingRouter.get('/leaderboard', requirePermission('marketing', 'view'), asyncHandler(ctrl.leaderboard));

// ── Affiliate profiles ──────────────────────────────────────
marketingRouter.post(
  '/affiliates',
  requirePermission('marketing', 'create'),
  validate(registerAffiliateSchema),
  asyncHandler(ctrl.registerAffiliate),
);
marketingRouter.get('/affiliates/me', requirePermission('marketing', 'view'), asyncHandler(ctrl.me));
marketingRouter.get('/affiliates', requirePermission('marketing', 'view'), asyncHandler(ctrl.listAffiliates));
marketingRouter.get('/affiliates/:id', requirePermission('marketing', 'view'), asyncHandler(ctrl.affiliateDetail));
marketingRouter.put(
  '/affiliates/:id/verify',
  requirePermission('marketing', 'update'),
  validate(verifyAffiliateSchema),
  asyncHandler(ctrl.verifyAffiliate),
);
marketingRouter.put(
  '/affiliates/:id/target',
  requirePermission('marketing', 'update'),
  validate(targetOverrideSchema),
  asyncHandler(ctrl.overrideTarget),
);

// ── Referral links ───────────────────────────────────────────
marketingRouter.post(
  '/referral-links',
  requirePermission('marketing', 'create'),
  validate(createReferralLinkSchema),
  asyncHandler(ctrl.createReferralLink),
);
marketingRouter.get('/referral-links', requirePermission('marketing', 'view'), asyncHandler(ctrl.listReferralLinks));

// ── Leads / pipeline ─────────────────────────────────────────
marketingRouter.get('/leads', requirePermission('marketing', 'view'), asyncHandler(ctrl.listLeads));
marketingRouter.post(
  '/leads',
  requirePermission('marketing', 'create'),
  validate(createLeadSchema),
  asyncHandler(ctrl.createLead),
);
marketingRouter.get('/leads/:id', requirePermission('marketing', 'view'), asyncHandler(ctrl.leadDetail));
marketingRouter.patch(
  '/leads/:id/stage',
  requirePermission('marketing', 'update'),
  validate(moveStageSchema),
  asyncHandler(ctrl.moveLeadStage),
);

// ── Commissions (finansial) ────────────────────────────────
marketingRouter.get('/commissions', requirePermission('komisi', 'view'), asyncHandler(ctrl.listCommissions));
marketingRouter.get('/commissions/:id', requirePermission('komisi', 'view'), asyncHandler(ctrl.commissionDetail));
marketingRouter.post(
  '/commissions/:id/submit',
  requirePermission('komisi', 'update'),
  asyncHandler(ctrl.submitCommission),
);
// approval Direktur (dijaga tambahan di service, bukan hanya permission)
marketingRouter.post(
  '/commissions/:id/approve',
  requirePermission('komisi', 'update'),
  validate(approveCommissionSchema),
  asyncHandler(ctrl.approveCommission),
);
// pencairan — dalam DB transaction
marketingRouter.post(
  '/commissions/:id/disburse',
  requirePermission('komisi', 'update'),
  validate(disburseCommissionSchema),
  asyncHandler(ctrl.disburseCommission),
);
