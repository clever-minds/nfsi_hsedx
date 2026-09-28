import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  adjustGradeSchema,
  gradeSubmissionSchema,
  releaseGradeSchema,
  requestRevisionSchema,
} from './grading.validation';
import * as ctrl from './grading.controller';

export const gradingRouter = Router();

gradingRouter.use(requireAuth());

// Antrian penilaian lintas kursus (staf: semua; instruktur/asisten: kursus sendiri)
gradingRouter.get('/submissions', requirePermission('grading', 'view'), asyncHandler(ctrl.listSubmissions));
gradingRouter.get('/submissions/:id/grade', requirePermission('grading', 'view'), asyncHandler(ctrl.getSubmissionGrade));
gradingRouter.post(
  '/submissions/:id/grade',
  requirePermission('grading', 'update'),
  validate(gradeSubmissionSchema),
  asyncHandler(ctrl.gradeSubmission),
);
gradingRouter.post(
  '/submissions/:id/request-revision',
  requirePermission('grading', 'update'),
  validate(requestRevisionSchema),
  asyncHandler(ctrl.requestRevision),
);
gradingRouter.post(
  '/grades/:id/release',
  requirePermission('grading', 'update'),
  validate(releaseGradeSchema),
  asyncHandler(ctrl.releaseGrade),
);
// nilai final terkunci setelah rilis — perubahan pasca-rilis wajib lewat endpoint ini (recordAudit + alasan).
gradingRouter.post(
  '/grades/:id/adjust',
  requirePermission('gradebook', 'update'),
  validate(adjustGradeSchema),
  asyncHandler(ctrl.adjustGrade),
);
gradingRouter.get('/courses/:courseId/gradebook', requirePermission('gradebook', 'view'), asyncHandler(ctrl.getGradebook));
