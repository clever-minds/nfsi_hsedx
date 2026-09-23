import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createThreadSchema,
  createPostSchema,
  pinThreadSchema,
  lockThreadSchema,
  createQuestionSchema,
  createAnswerSchema,
  markTerjawabSchema,
  createCommentSchema,
  toggleReactionSchema,
  createReportSchema,
  actOnReportSchema,
} from './discussions.validation';
import * as ctrl from './discussions.controller';

export const discussionsRouter = Router();

discussionsRouter.use(requireAuth());

// Forum per kursus
discussionsRouter.get(
  '/courses/:courseId/threads',
  requirePermission('diskusi', 'view'),
  asyncHandler(ctrl.listThreads),
);
discussionsRouter.post(
  '/courses/:courseId/threads',
  requirePermission('diskusi', 'create'),
  validate(createThreadSchema),
  asyncHandler(ctrl.createThread),
);
discussionsRouter.get('/threads/:id', requirePermission('diskusi', 'view'), asyncHandler(ctrl.threadDetail));
discussionsRouter.post(
  '/threads/:id/posts',
  requirePermission('diskusi', 'create'),
  validate(createPostSchema),
  asyncHandler(ctrl.reply),
);
discussionsRouter.put(
  '/threads/:id/pin',
  requirePermission('diskusi', 'update'),
  validate(pinThreadSchema),
  asyncHandler(ctrl.pinThread),
);
discussionsRouter.put(
  '/threads/:id/lock',
  requirePermission('diskusi', 'update'),
  validate(lockThreadSchema),
  asyncHandler(ctrl.lockThread),
);

// Q&A per pelajaran
discussionsRouter.get(
  '/lessons/:lessonId/questions',
  requirePermission('diskusi', 'view'),
  asyncHandler(ctrl.listQuestions),
);
discussionsRouter.post(
  '/lessons/:lessonId/questions',
  requirePermission('diskusi', 'create'),
  validate(createQuestionSchema),
  asyncHandler(ctrl.askQuestion),
);
discussionsRouter.post(
  '/questions/:id/answers',
  requirePermission('diskusi', 'create'),
  validate(createAnswerSchema),
  asyncHandler(ctrl.answerQuestion),
);
discussionsRouter.put(
  '/questions/:id/terjawab',
  requirePermission('diskusi', 'update'),
  validate(markTerjawabSchema),
  asyncHandler(ctrl.markQuestionTerjawab),
);
discussionsRouter.post(
  '/questions/:id/upvote',
  requirePermission('diskusi', 'create'),
  asyncHandler(ctrl.upvoteQuestion),
);
discussionsRouter.post(
  '/answers/:id/upvote',
  requirePermission('diskusi', 'create'),
  asyncHandler(ctrl.upvoteAnswer),
);

// Komentar & reaksi umum
discussionsRouter.post(
  '/comments',
  requirePermission('diskusi', 'create'),
  validate(createCommentSchema),
  asyncHandler(ctrl.createComment),
);
discussionsRouter.post(
  '/reactions',
  requirePermission('diskusi', 'create'),
  validate(toggleReactionSchema),
  asyncHandler(ctrl.toggleReaction),
);

// Moderasi
discussionsRouter.post(
  '/reports',
  requirePermission('diskusi', 'create'),
  validate(createReportSchema),
  asyncHandler(ctrl.createReport),
);
discussionsRouter.get('/reports', requirePermission('diskusi', 'view'), asyncHandler(ctrl.listReports));
discussionsRouter.patch(
  '/reports/:id',
  requirePermission('diskusi', 'delete'),
  validate(actOnReportSchema),
  asyncHandler(ctrl.actOnReport),
);
