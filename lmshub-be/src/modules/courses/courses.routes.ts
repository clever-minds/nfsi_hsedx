import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { archiveCourseSchema, createCourseSchema, publishCourseSchema, updateCourseSchema, completionRulesSchema } from './courses.validation';
import * as ctrl from './courses.controller';

export const coursesRouter = Router();

// PUBLIC — catalog & detail course (dikonsumsi area pra-login lmshub-fe), hanya status publish/diperbarui
coursesRouter.get('/public', asyncHandler(ctrl.publicList));
coursesRouter.get('/public/:slug', asyncHandler(ctrl.publicDetail));
coursesRouter.get('/public/:slug/preview/:lessonId', asyncHandler(ctrl.publicLessonPreview));

// ── Dashboard (terproteksi) ─────────────────────────
coursesRouter.get('/', requireAuth(), requirePermission('course', 'view'), asyncHandler(ctrl.list));
coursesRouter.post(
  '/',
  requireAuth(),
  requirePermission('course', 'create'),
  validate(createCourseSchema),
  asyncHandler(ctrl.create),
);
coursesRouter.get('/:id', requireAuth(), requirePermission('course', 'view'), asyncHandler(ctrl.detail));
coursesRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('course', 'update'),
  validate(updateCourseSchema),
  asyncHandler(ctrl.update),
);
// Aturan kelulusan (exam akhir, izin ulang course) — no memicu review ulang.
coursesRouter.put(
  '/:id/completion-rules',
  requireAuth(),
  requirePermission('course', 'update'),
  validate(completionRulesSchema),
  asyncHandler(ctrl.updateCompletionRules),
);
coursesRouter.delete('/:id', requireAuth(), requirePermission('course', 'delete'), asyncHandler(ctrl.remove));

// ── Lifecycle publikasi: draf → dalam_review → publish → diperbarui → diarsip
coursesRouter.post('/:id/submit', requireAuth(), requirePermission('course', 'update'), asyncHandler(ctrl.submit));
coursesRouter.post(
  '/:id/publish',
  requireAuth(),
  requirePermission('course', 'update'), // approval admin ditegakkan lagi di service (Admin Ops/Direktur to on)
  validate(publishCourseSchema),
  asyncHandler(ctrl.publish),
);
coursesRouter.post(
  '/:id/archive',
  requireAuth(),
  requirePermission('course', 'update'),
  validate(archiveCourseSchema),
  asyncHandler(ctrl.archive),
);
