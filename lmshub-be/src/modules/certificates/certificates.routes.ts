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

// PUBLIC — verifikasi keaslian sertifikat, tanpa requireAuth, tanpa membocorkan data pribadi
certificatesRouter.get('/public/certificates/verify/:nomor', asyncHandler(ctrl.verify));

// ── Sertifikat ──────────────────────────────────────────────
certificatesRouter.get('/certificates', requireAuth(), requirePermission('sertifikat', 'view'), asyncHandler(ctrl.list));
certificatesRouter.get('/certificates/:id', requireAuth(), requirePermission('sertifikat', 'view'), asyncHandler(ctrl.detail));
// Data render desain sertifikat (pemilik/staf) — cek kepemilikan di service
certificatesRouter.get('/certificates/:id/render', requireAuth(), requirePermission('sertifikat', 'view'), asyncHandler(ctrl.renderCert));
// Self-service siswa: terbitkan sertifikat sendiri (own enrollment) tanpa sertifikat.update
certificatesRouter.post(
  '/enrollments/:enrollmentId/certificate/claim',
  requireAuth(),
  requirePermission('sertifikat', 'view'),
  asyncHandler(ctrl.claim),
);
certificatesRouter.post(
  '/enrollments/:enrollmentId/graduation-evaluate',
  requireAuth(),
  requirePermission('sertifikat', 'view'),
  asyncHandler(ctrl.evaluate),
);
certificatesRouter.post(
  '/certificates/:id/issue',
  requireAuth(),
  requirePermission('sertifikat', 'update'),
  asyncHandler(ctrl.issue),
);
certificatesRouter.post(
  '/certificates/exception-issue',
  requireAuth(),
  requirePermission('sertifikat', 'create'),
  validate(exceptionIssueSchema),
  asyncHandler(ctrl.exceptionIssue),
);
certificatesRouter.post(
  '/certificates/:id/reissue',
  requireAuth(),
  requirePermission('sertifikat', 'update'),
  validate(reissueSchema),
  asyncHandler(ctrl.reissue),
);
certificatesRouter.post(
  '/certificates/:id/revoke',
  requireAuth(),
  requirePermission('sertifikat', 'update'),
  validate(revokeSchema),
  asyncHandler(ctrl.revoke),
);

// ── Template sertifikat (admin) ────────────────────────────
certificatesRouter.get(
  '/certificate-templates',
  requireAuth(),
  requirePermission('sertifikat', 'view'),
  asyncHandler(ctrl.listTemplates),
);
certificatesRouter.post(
  '/certificate-templates',
  requireAuth(),
  requirePermission('sertifikat', 'create'),
  validate(createTemplateSchema),
  asyncHandler(ctrl.createTemplate),
);
certificatesRouter.put(
  '/certificate-templates/:id',
  requireAuth(),
  requirePermission('sertifikat', 'update'),
  validate(updateTemplateSchema),
  asyncHandler(ctrl.updateTemplate),
);
certificatesRouter.delete(
  '/certificate-templates/:id',
  requireAuth(),
  requirePermission('sertifikat', 'delete'),
  asyncHandler(ctrl.deleteTemplate),
);

// ── Badge & gamifikasi ──────────────────────────────────────
certificatesRouter.get('/badges', requireAuth(), requirePermission('gamifikasi', 'view'), asyncHandler(ctrl.listBadges));
certificatesRouter.post(
  '/badges',
  requireAuth(),
  requirePermission('gamifikasi', 'create'),
  validate(createBadgeSchema),
  asyncHandler(ctrl.createBadge),
);
certificatesRouter.post(
  '/badges/:id/award',
  requireAuth(),
  requirePermission('gamifikasi', 'create'),
  validate(awardBadgeSchema),
  asyncHandler(ctrl.awardBadge),
);
certificatesRouter.get('/users/me/badges', requireAuth(), requirePermission('gamifikasi', 'view'), asyncHandler(ctrl.myBadges));

certificatesRouter.get('/users/me/points', requireAuth(), requirePermission('gamifikasi', 'view'), asyncHandler(ctrl.myPoints));
certificatesRouter.post(
  '/points',
  requireAuth(),
  requirePermission('gamifikasi', 'create'),
  validate(awardPointsSchema),
  asyncHandler(ctrl.awardPoints),
);

certificatesRouter.get('/leaderboards', requireAuth(), requirePermission('gamifikasi', 'view'), asyncHandler(ctrl.leaderboards));
certificatesRouter.post(
  '/leaderboards/snapshot',
  requireAuth(),
  requirePermission('gamifikasi', 'create'),
  validate(leaderboardSnapshotSchema),
  asyncHandler(ctrl.generateLeaderboardSnapshot),
);

certificatesRouter.get('/users/me/streak', requireAuth(), requirePermission('gamifikasi', 'view'), asyncHandler(ctrl.myStreak));
certificatesRouter.post(
  '/users/me/streak/record-activity',
  requireAuth(),
  requirePermission('gamifikasi', 'view'),
  asyncHandler(ctrl.recordStreakActivity),
);
