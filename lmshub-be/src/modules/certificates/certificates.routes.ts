import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createTemplateSchema,
  updateTemplateSchema,
  exceptionIssueSchema,
  reissueSchema,
  revokeSchema,
  createBadgeSchema,
  awardBadgeSchema,
  awardPointsSchema,
  leaderboardSnapshotSchema,
} from './certificates.validation';
import * as ctrl from './certificates.controller';

export const certificatesRouter = Router();

// PUBLIC — verifikasi keaslian certificate, tanpa requireAuth, tanpa membocorkan data pribadi
certificatesRouter.get('/public/certificates/verify/:number', asyncHandler(ctrl.verify));

// ── Certificate ──────────────────────────────────────────────
certificatesRouter.get('/certificates', requireAuth(), requirePermission('certificate', 'view'), asyncHandler(ctrl.list));
certificatesRouter.get('/certificates/:id', requireAuth(), requirePermission('certificate', 'view'), asyncHandler(ctrl.detail));
// Data render desain certificate (pemilik/staf) — cek kepemilikan di service
certificatesRouter.get('/certificates/:id/render', requireAuth(), requirePermission('certificate', 'view'), asyncHandler(ctrl.renderCert));
// Self-service student: terbitkan certificate sendiri (own enrollment) tanpa certificate.update
certificatesRouter.post(
  '/enrollments/:enrollmentId/certificate/claim',
  requireAuth(),
  requirePermission('certificate', 'view'),
  asyncHandler(ctrl.claim),
);
certificatesRouter.post(
  '/enrollments/:enrollmentId/graduation-evaluate',
  requireAuth(),
  requirePermission('certificate', 'view'),
  asyncHandler(ctrl.evaluate),
);
certificatesRouter.post(
  '/certificates/:id/issue',
  requireAuth(),
  requirePermission('certificate', 'update'),
  asyncHandler(ctrl.issue),
);
certificatesRouter.post(
  '/certificates/exception-issue',
  requireAuth(),
  requirePermission('certificate', 'create'),
  validate(exceptionIssueSchema),
  asyncHandler(ctrl.exceptionIssue),
);
certificatesRouter.post(
  '/certificates/:id/reissue',
  requireAuth(),
  requirePermission('certificate', 'update'),
  validate(reissueSchema),
  asyncHandler(ctrl.reissue),
);
certificatesRouter.post(
  '/certificates/:id/revoke',
  requireAuth(),
  requirePermission('certificate', 'update'),
  validate(revokeSchema),
  asyncHandler(ctrl.revoke),
);

// ── Template certificate (admin) ────────────────────────────
certificatesRouter.get(
  '/certificate-templates',
  requireAuth(),
  requirePermission('certificate', 'view'),
  asyncHandler(ctrl.listTemplates),
);
certificatesRouter.post(
  '/certificate-templates',
  requireAuth(),
  requirePermission('certificate', 'create'),
  validate(createTemplateSchema),
  asyncHandler(ctrl.createTemplate),
);
certificatesRouter.put(
  '/certificate-templates/:id',
  requireAuth(),
  requirePermission('certificate', 'update'),
  validate(updateTemplateSchema),
  asyncHandler(ctrl.updateTemplate),
);
certificatesRouter.delete(
  '/certificate-templates/:id',
  requireAuth(),
  requirePermission('certificate', 'delete'),
  asyncHandler(ctrl.deleteTemplate),
);

// ── Badge & gamifikasi ──────────────────────────────────────
certificatesRouter.get('/badges', requireAuth(), requirePermission('gamification', 'view'), asyncHandler(ctrl.listBadges));
certificatesRouter.post(
  '/badges',
  requireAuth(),
  requirePermission('gamification', 'create'),
  validate(createBadgeSchema),
  asyncHandler(ctrl.createBadge),
);
certificatesRouter.post(
  '/badges/:id/award',
  requireAuth(),
  requirePermission('gamification', 'create'),
  validate(awardBadgeSchema),
  asyncHandler(ctrl.awardBadge),
);
certificatesRouter.get('/users/me/badges', requireAuth(), requirePermission('gamification', 'view'), asyncHandler(ctrl.myBadges));

certificatesRouter.get('/users/me/pointsts', requireAuth(), requirePermission('gamification', 'view'), asyncHandler(ctrl.myPoints));
certificatesRouter.post(
  '/pointsts',
  requireAuth(),
  requirePermission('gamification', 'create'),
  validate(awardPointsSchema),
  asyncHandler(ctrl.awardPoints),
);

certificatesRouter.get('/leaderboards', requireAuth(), requirePermission('gamification', 'view'), asyncHandler(ctrl.leaderboards));
certificatesRouter.post(
  '/leaderboards/snapshot',
  requireAuth(),
  requirePermission('gamification', 'create'),
  validate(leaderboardSnapshotSchema),
  asyncHandler(ctrl.generateLeaderboardSnapshot),
);

certificatesRouter.get('/users/me/streak', requireAuth(), requirePermission('gamification', 'view'), asyncHandler(ctrl.myStreak));
certificatesRouter.post(
  '/users/me/streak/record-activity',
  requireAuth(),
  requirePermission('gamification', 'view'),
  asyncHandler(ctrl.recordStreakActivity),
);
