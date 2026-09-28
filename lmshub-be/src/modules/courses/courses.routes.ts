import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { archiveCourseSchema, createCourseSchema, publishCourseSchema, updateCourseSchema } from './courses.validation';
import * as ctrl from './courses.controller';

export const coursesRouter = Router();

// PUBLIC — katalog & detail kursus (dikonsumsi area pra-login lmshub-fe), hanya status terbit/diperbarui
coursesRouter.get('/public', asyncHandler(ctrl.publicList));
coursesRouter.get('/public/:slug', asyncHandler(ctrl.publicDetail));

// ── Dashboard (terproteksi) ─────────────────────────
coursesRouter.get('/', requireAuth(), requirePermission('kursus', 'view'), asyncHandler(ctrl.list));
coursesRouter.post(
  '/',
  requireAuth(),
  requirePermission('kursus', 'create'),
  validate(createCourseSchema),
  asyncHandler(ctrl.create),
);
coursesRouter.get('/:id', requireAuth(), requirePermission('kursus', 'view'), asyncHandler(ctrl.detail));
coursesRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('kursus', 'update'),
  validate(updateCourseSchema),
  asyncHandler(ctrl.update),
);
coursesRouter.delete('/:id', requireAuth(), requirePermission('kursus', 'delete'), asyncHandler(ctrl.remove));

// ── Lifecycle publikasi: draf → dalam_review → terbit → diperbarui → diarsip
coursesRouter.post('/:id/submit', requireAuth(), requirePermission('kursus', 'update'), asyncHandler(ctrl.submit));
coursesRouter.post(
  '/:id/publish',
  requireAuth(),
  requirePermission('kursus', 'update'), // approval admin ditegakkan lagi di service (Admin Ops/Direktur ke atas)
  validate(publishCourseSchema),
  asyncHandler(ctrl.publish),
);
coursesRouter.post(
  '/:id/archive',
  requireAuth(),
  requirePermission('kursus', 'update'),
  validate(archiveCourseSchema),
  asyncHandler(ctrl.archive),
);
