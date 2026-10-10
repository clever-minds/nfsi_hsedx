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
assessmentsRouter.get('/question-banks', requirePermission('question_bank', 'view'), asyncHandler(ctrl.listQuestionBanks));
assessmentsRouter.post(
  '/question-banks',
  requirePermission('question_bank', 'create'),
  validate(createQuestionBankSchema),
  asyncHandler(ctrl.createQuestionBank),
);
assessmentsRouter.get('/question-banks/:id', requirePermission('question_bank', 'view'), asyncHandler(ctrl.questionBankDetail));
assessmentsRouter.put(
  '/question-banks/:id',
  requirePermission('question_bank', 'update'),
  validate(updateQuestionBankSchema),
  asyncHandler(ctrl.updateQuestionBank),
);
assessmentsRouter.delete('/question-banks/:id', requirePermission('question_bank', 'delete'), asyncHandler(ctrl.removeQuestionBank));

assessmentsRouter.get('/question-banks/:id/questions', requirePermission('question_bank', 'view'), asyncHandler(ctrl.listQuestions));
assessmentsRouter.post(
  '/question-banks/:id/questions',
  requirePermission('question_bank', 'create'),
  validate(createQuestionSchema),
  asyncHandler(ctrl.createQuestion),
);
assessmentsRouter.put(
  '/questions/:id',
  requirePermission('question_bank', 'update'),
  validate(updateQuestionSchema),
  asyncHandler(ctrl.updateQuestion),
);
assessmentsRouter.delete('/questions/:id', requirePermission('question_bank', 'delete'), asyncHandler(ctrl.removeQuestion));

// ── Quiz ───────────────────────────────────────────────
assessmentsRouter.get('/quizzes', requirePermission('assessment', 'view'), asyncHandler(ctrl.listQuizzes));
assessmentsRouter.post('/quizzes', requirePermission('assessment', 'create'), validate(createQuizSchema), asyncHandler(ctrl.createQuiz));
assessmentsRouter.get('/quizzes/:id', requirePermission('assessment', 'view'), asyncHandler(ctrl.quizDetail));
assessmentsRouter.put('/quizzes/:id', requirePermission('assessment', 'update'), validate(updateQuizSchema), asyncHandler(ctrl.updateQuiz));
assessmentsRouter.delete('/quizzes/:id', requirePermission('assessment', 'delete'), asyncHandler(ctrl.removeQuiz));
assessmentsRouter.put(
  '/quizzes/:id/questions',
  requirePermission('assessment', 'update'),
  validate(setQuizQuestionsSchema),
  asyncHandler(ctrl.setQuizQuestions),
);

// ── Assignment & Rubrik ───────────────────────────────────────
assessmentsRouter.get('/assignments', requirePermission('assessment', 'view'), asyncHandler(ctrl.listAssignments));
assessmentsRouter.post(
  '/assignments',
  requirePermission('assessment', 'create'),
  validate(createAssignmentSchema),
  asyncHandler(ctrl.createAssignment),
);
assessmentsRouter.get('/assignments/:id', requirePermission('assessment', 'view'), asyncHandler(ctrl.assignmentDetail));
assessmentsRouter.put(
  '/assignments/:id',
  requirePermission('assessment', 'update'),
  validate(updateAssignmentSchema),
  asyncHandler(ctrl.updateAssignment),
);
assessmentsRouter.delete('/assignments/:id', requirePermission('assessment', 'delete'), asyncHandler(ctrl.removeAssignment));
assessmentsRouter.put(
  '/assignments/:id/rubric',
  requirePermission('assessment', 'update'),
  validate(upsertRubricSchema),
  asyncHandler(ctrl.upsertRubric),
);

// ── Attempts (student, Sendiri — enrollment active) ─────────
assessmentsRouter.post('/quizzes/:id/attempts', requirePermission('assessment', 'create'), asyncHandler(ctrl.startAttempt));
assessmentsRouter.get('/attempts/:id', requirePermission('assessment', 'view'), asyncHandler(ctrl.attemptDetail));
assessmentsRouter.put(
  '/attempts/:id/answers',
  requirePermission('assessment', 'update'),
  validate(saveAnswerSchema),
  asyncHandler(ctrl.saveAnswer),
);
assessmentsRouter.post('/attempts/:id/submit', requirePermission('assessment', 'update'), asyncHandler(ctrl.submitAttempt));

// ── Assignment Submissions (student, Sendiri — enrollment active) ──
assessmentsRouter.post(
  '/assignments/:id/submissions',
  requirePermission('assessment', 'create'),
  validate(submitAssignmentSchema),
  asyncHandler(ctrl.submitAssignment),
);
assessmentsRouter.get(
  '/assignments/:id/submissions',
  requirePermission('assessment', 'view'),
  asyncHandler(ctrl.listSubmissionsForAssignment),
);
