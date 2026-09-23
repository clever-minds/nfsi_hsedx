import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createBookmarkSchema,
  createNoteSchema,
  updateLessonProgressSchema,
  updateNoteSchema,
} from './progress.validation';
import * as ctrl from './progress.controller';

export const progressRouter = Router();

progressRouter.use(requireAuth());

// Semua endpoint di-scope "Sendiri" (siswa hanya data miliknya) via req.auth.userId di service.
progressRouter.put(
  '/lessons/:lessonId/progress',
  requirePermission('enrollment', 'view'),
  validate(updateLessonProgressSchema),
  asyncHandler(ctrl.updateLessonProgress),
);
progressRouter.get('/courses/:courseId/progress', requirePermission('enrollment', 'view'), asyncHandler(ctrl.getCourseProgress));

// Tampilan belajar (kurikulum + progres) untuk siswa ter-enroll — dikonsumsi CoursePlayerView FE.
progressRouter.get('/courses/:courseId/learn', requirePermission('enrollment', 'view'), asyncHandler(ctrl.learnView));

progressRouter.get('/lessons/:lessonId/notes', requirePermission('enrollment', 'view'), asyncHandler(ctrl.listNotes));
progressRouter.post(
  '/lessons/:lessonId/notes',
  requirePermission('enrollment', 'view'),
  validate(createNoteSchema),
  asyncHandler(ctrl.createNote),
);
progressRouter.put('/notes/:id', requirePermission('enrollment', 'view'), validate(updateNoteSchema), asyncHandler(ctrl.updateNote));
progressRouter.delete('/notes/:id', requirePermission('enrollment', 'view'), asyncHandler(ctrl.removeNote));

progressRouter.get('/lessons/:lessonId/bookmarks', requirePermission('enrollment', 'view'), asyncHandler(ctrl.listBookmarks));
progressRouter.post(
  '/lessons/:lessonId/bookmarks',
  requirePermission('enrollment', 'view'),
  validate(createBookmarkSchema),
  asyncHandler(ctrl.createBookmark),
);
progressRouter.delete('/bookmarks/:id', requirePermission('enrollment', 'view'), asyncHandler(ctrl.removeBookmark));
