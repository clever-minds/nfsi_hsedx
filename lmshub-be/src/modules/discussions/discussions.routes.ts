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

// Forum per course
discussionsRouter.get(
  '/courses/:courseId/threads',
  requirePermission('discussion', 'view'),
  asyncHandler(ctrl.listThreads),
);
discussionsRouter.post(
  '/courses/:courseId/threads',
  requirePermission('discussion', 'create'),
  validate(createThreadSchema),
  asyncHandler(ctrl.createThread),
);
discussionsRouter.get('/threads/:id', requirePermission('discussion', 'view'), asyncHandler(ctrl.threadDetail));
discussionsRouter.post(
  '/threads/:id/posts',
  requirePermission('discussion', 'create'),
  validate(createPostSchema),
  asyncHandler(ctrl.reply),
);
discussionsRouter.put(
  '/threads/:id/pin',
  requirePermission('discussion', 'update'),
  validate(pinThreadSchema),
  asyncHandler(ctrl.pinThread),
);
discussionsRouter.put(
  '/threads/:id/lock',
  requirePermission('discussion', 'update'),
  validate(lockThreadSchema),
  asyncHandler(ctrl.lockThread),
);

// Q&A per pelajaran
discussionsRouter.get(
  '/lessons/:lessonId/questions',
  requirePermission('discussion', 'view'),
  asyncHandler(ctrl.listQuestions),
);
discussionsRouter.post(
  '/lessons/:lessonId/questions',
  requirePermission('discussion', 'create'),
  validate(createQuestionSchema),
  asyncHandler(ctrl.askQuestion),
);
discussionsRouter.post(
  '/questions/:id/answers',
  requirePermission('discussion', 'create'),
  validate(createAnswerSchema),
  asyncHandler(ctrl.answerQuestion),
);
discussionsRouter.put(
  '/questions/:id/terjawab',
  requirePermission('discussion', 'update'),
  validate(markTerjawabSchema),
  asyncHandler(ctrl.markQuestionTerjawab),
);
discussionsRouter.post(
  '/questions/:id/upvote',
  requirePermission('discussion', 'create'),
  asyncHandler(ctrl.upvoteQuestion),
);
discussionsRouter.post(
  '/answers/:id/upvote',
  requirePermission('discussion', 'create'),
  asyncHandler(ctrl.upvoteAnswer),
);

// Komentar & reaksi umum
discussionsRouter.post(
  '/comments',
  requirePermission('discussion', 'create'),
  validate(createCommentSchema),
  asyncHandler(ctrl.createComment),
);
discussionsRouter.post(
  '/reactions',
  requirePermission('discussion', 'create'),
  validate(toggleReactionSchema),
  asyncHandler(ctrl.toggleReaction),
);

// Moderasi
discussionsRouter.post(
  '/reports',
  requirePermission('discussion', 'create'),
  validate(createReportSchema),
  asyncHandler(ctrl.createReport),
);
discussionsRouter.get('/reports', requirePermission('discussion', 'view'), asyncHandler(ctrl.listReports));
discussionsRouter.patch(
  '/reports/:id',
  requirePermission('discussion', 'delete'),
  validate(actOnReportSchema),
  asyncHandler(ctrl.actOnReport),
);
