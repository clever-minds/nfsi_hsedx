import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  bulkImportSchema,
  createCohortSchema,
  createEnrollmentSchema,
  openSlotSchema,
  revokeEnrollmentSchema,
  transferEnrollmentSchema,
  updateCohortSchema,
} from './enrollments.validation';
import * as ctrl from './enrollments.controller';

export const enrollmentsRouter = Router();

enrollmentsRouter.use(requireAuth());

// ── Enrollments ─────────────────────────────────────────
// GET otomatis ter-scope ke "kursus saya" untuk siswa (row-level di service).
enrollmentsRouter.get('/enrollments', requirePermission('enrollment', 'view'), asyncHandler(ctrl.list));
enrollmentsRouter.post(
  '/enrollments',
  requirePermission('enrollment', 'create'),
  validate(createEnrollmentSchema),
  asyncHandler(ctrl.create),
);
enrollmentsRouter.get('/enrollments/:id', requirePermission('enrollment', 'view'), asyncHandler(ctrl.detail));
enrollmentsRouter.put(
  '/enrollments/:id/transfer',
  requirePermission('enrollment', 'update'),
  validate(transferEnrollmentSchema),
  asyncHandler(ctrl.transfer),
);
enrollmentsRouter.post(
  '/enrollments/:id/revoke',
  requirePermission('enrollment', 'delete'),
  validate(revokeEnrollmentSchema),
  asyncHandler(ctrl.revoke),
);
enrollmentsRouter.post(
  '/enrollments/bulk-import',
  requirePermission('enrollment', 'create'),
  validate(bulkImportSchema),
  asyncHandler(ctrl.bulkImport),
);

// ── Cohorts ─────────────────────────────────────────────
// Daftar semua cohort lintas kursus (admin) — WAJIB sebelum '/cohorts/:id...' agar tidak tertangkap :id.
enrollmentsRouter.get('/cohorts', requirePermission('cohort', 'view'), asyncHandler(ctrl.listAllCohorts));
enrollmentsRouter.get('/courses/:courseId/cohorts', requirePermission('cohort', 'view'), asyncHandler(ctrl.listCohorts));
enrollmentsRouter.post(
  '/courses/:courseId/cohorts',
  requirePermission('cohort', 'create'),
  validate(createCohortSchema),
  asyncHandler(ctrl.createCohort),
);
enrollmentsRouter.put(
  '/cohorts/:id',
  requirePermission('cohort', 'update'),
  validate(updateCohortSchema),
  asyncHandler(ctrl.updateCohort),
);
enrollmentsRouter.get('/cohorts/:id/members', requirePermission('cohort', 'view'), asyncHandler(ctrl.listCohortMembers));
enrollmentsRouter.get('/cohorts/:id/waitlist', requirePermission('cohort', 'view'), asyncHandler(ctrl.listCohortWaitlist));
enrollmentsRouter.patch(
  '/cohorts/:id/waitlist/:memberId/promote',
  requirePermission('cohort', 'update'),
  asyncHandler(ctrl.promoteWaitlistMember),
);
enrollmentsRouter.post('/cohorts/:id/join', requirePermission('cohort', 'create'), asyncHandler(ctrl.joinCohort));
enrollmentsRouter.post(
  '/cohorts/:id/open-slot',
  requirePermission('cohort', 'update'),
  validate(openSlotSchema),
  asyncHandler(ctrl.openSlot),
);
