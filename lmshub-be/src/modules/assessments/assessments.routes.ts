import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createAssignmentSchema,
  createQuestionBankSchema,
  createQuestionSchema,
  createQuizSchema,
  saveAnswerSchema,
  setQuizQuestionsSchema,
  submitAssignmentSchema,
  updateAssignmentSchema,
  updateQuestionBankSchema,
  updateQuestionSchema,
  updateQuizSchema,
  upsertRubricSchema,
} from './assessments.validation';
import * as ctrl from './assessments.controller';

export const assessmentsRouter = Router();

assessmentsRouter.use(requireAuth());

// ── Bank Soal ────────────────────────────────────────────
assessmentsRouter.get('/question-banks', requirePermission('bank_soal', 'view'), asyncHandler(ctrl.listQuestionBanks));
assessmentsRouter.post(
  '/question-banks',
  requirePermission('bank_soal', 'create'),
  validate(createQuestionBankSchema),
  asyncHandler(ctrl.createQuestionBank),
);
assessmentsRouter.get('/question-banks/:id', requirePermission('bank_soal', 'view'), asyncHandler(ctrl.questionBankDetail));
assessmentsRouter.put(
  '/question-banks/:id',
  requirePermission('bank_soal', 'update'),
  validate(updateQuestionBankSchema),
  asyncHandler(ctrl.updateQuestionBank),
);
assessmentsRouter.delete('/question-banks/:id', requirePermission('bank_soal', 'delete'), asyncHandler(ctrl.removeQuestionBank));

assessmentsRouter.get('/question-banks/:id/questions', requirePermission('bank_soal', 'view'), asyncHandler(ctrl.listQuestions));
assessmentsRouter.post(
  '/question-banks/:id/questions',
  requirePermission('bank_soal', 'create'),
  validate(createQuestionSchema),
  asyncHandler(ctrl.createQuestion),
);
assessmentsRouter.put(
  '/questions/:id',
  requirePermission('bank_soal', 'update'),
  validate(updateQuestionSchema),
  asyncHandler(ctrl.updateQuestion),
);
assessmentsRouter.delete('/questions/:id', requirePermission('bank_soal', 'delete'), asyncHandler(ctrl.removeQuestion));

// ── Kuis ───────────────────────────────────────────────
assessmentsRouter.get('/quizzes', requirePermission('asesmen', 'view'), asyncHandler(ctrl.listQuizzes));
assessmentsRouter.post('/quizzes', requirePermission('asesmen', 'create'), validate(createQuizSchema), asyncHandler(ctrl.createQuiz));
assessmentsRouter.get('/quizzes/:id', requirePermission('asesmen', 'view'), asyncHandler(ctrl.quizDetail));
assessmentsRouter.put('/quizzes/:id', requirePermission('asesmen', 'update'), validate(updateQuizSchema), asyncHandler(ctrl.updateQuiz));
assessmentsRouter.delete('/quizzes/:id', requirePermission('asesmen', 'delete'), asyncHandler(ctrl.removeQuiz));
assessmentsRouter.put(
  '/quizzes/:id/questions',
  requirePermission('asesmen', 'update'),
  validate(setQuizQuestionsSchema),
  asyncHandler(ctrl.setQuizQuestions),
);

// ── Tugas & Rubrik ───────────────────────────────────────
assessmentsRouter.get('/assignments', requirePermission('asesmen', 'view'), asyncHandler(ctrl.listAssignments));
assessmentsRouter.post(
  '/assignments',
  requirePermission('asesmen', 'create'),
  validate(createAssignmentSchema),
  asyncHandler(ctrl.createAssignment),
);
assessmentsRouter.get('/assignments/:id', requirePermission('asesmen', 'view'), asyncHandler(ctrl.assignmentDetail));
assessmentsRouter.put(
  '/assignments/:id',
  requirePermission('asesmen', 'update'),
  validate(updateAssignmentSchema),
  asyncHandler(ctrl.updateAssignment),
);
assessmentsRouter.delete('/assignments/:id', requirePermission('asesmen', 'delete'), asyncHandler(ctrl.removeAssignment));
assessmentsRouter.put(
  '/assignments/:id/rubric',
  requirePermission('asesmen', 'update'),
  validate(upsertRubricSchema),
  asyncHandler(ctrl.upsertRubric),
);

// ── Attempts (siswa, Sendiri — enrollment aktif) ─────────
assessmentsRouter.post('/quizzes/:id/attempts', requirePermission('asesmen', 'create'), asyncHandler(ctrl.startAttempt));
assessmentsRouter.get('/attempts/:id', requirePermission('asesmen', 'view'), asyncHandler(ctrl.attemptDetail));
assessmentsRouter.put(
  '/attempts/:id/answers',
  requirePermission('asesmen', 'update'),
  validate(saveAnswerSchema),
  asyncHandler(ctrl.saveAnswer),
);
assessmentsRouter.post('/attempts/:id/submit', requirePermission('asesmen', 'update'), asyncHandler(ctrl.submitAttempt));

// ── Assignment Submissions (siswa, Sendiri — enrollment aktif) ──
assessmentsRouter.post(
  '/assignments/:id/submissions',
  requirePermission('asesmen', 'create'),
  validate(submitAssignmentSchema),
  asyncHandler(ctrl.submitAssignment),
);
assessmentsRouter.get(
  '/assignments/:id/submissions',
  requirePermission('asesmen', 'view'),
  asyncHandler(ctrl.listSubmissionsForAssignment),
);
