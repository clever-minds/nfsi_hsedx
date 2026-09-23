import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createContentSchema,
  createLessonSchema,
  createSectionSchema,
  reorderLessonsSchema,
  reorderSectionsSchema,
  updateContentSchema,
  updateLessonSchema,
  updateSectionSchema,
} from './curriculum.validation';
import * as ctrl from './curriculum.controller';

export const curriculumRouter = Router();

curriculumRouter.use(requireAuth());

// ── Sections (nested di bawah course) ───────────────
curriculumRouter.get(
  '/courses/:courseId/sections',
  requirePermission('kurikulum', 'view'),
  asyncHandler(ctrl.listSections),
);
curriculumRouter.post(
  '/courses/:courseId/sections',
  requirePermission('kurikulum', 'create'),
  validate(createSectionSchema),
  asyncHandler(ctrl.createSection),
);
// Didaftarkan sebelum '/sections/:id' agar 'reorder' tidak tertangkap sebagai :courseId/:id param.
curriculumRouter.put(
  '/courses/:courseId/sections/reorder',
  requirePermission('kurikulum', 'update'),
  validate(reorderSectionsSchema),
  asyncHandler(ctrl.reorderSections),
);
curriculumRouter.put(
  '/sections/:id',
  requirePermission('kurikulum', 'update'),
  validate(updateSectionSchema),
  asyncHandler(ctrl.updateSection),
);
curriculumRouter.delete('/sections/:id', requirePermission('kurikulum', 'delete'), asyncHandler(ctrl.removeSection));

// ── Lessons (nested di bawah section) ───────────────
curriculumRouter.get(
  '/sections/:sectionId/lessons',
  requirePermission('kurikulum', 'view'),
  asyncHandler(ctrl.listLessons),
);
curriculumRouter.post(
  '/sections/:sectionId/lessons',
  requirePermission('kurikulum', 'create'),
  validate(createLessonSchema),
  asyncHandler(ctrl.createLesson),
);
// Didaftarkan sebelum '/lessons/:id' agar 'reorder' tidak tertangkap sebagai :id param.
curriculumRouter.put(
  '/lessons/reorder',
  requirePermission('kurikulum', 'update'),
  validate(reorderLessonsSchema),
  asyncHandler(ctrl.reorderLessons),
);
curriculumRouter.put(
  '/lessons/:id',
  requirePermission('kurikulum', 'update'),
  validate(updateLessonSchema),
  asyncHandler(ctrl.updateLesson),
);
curriculumRouter.delete('/lessons/:id', requirePermission('kurikulum', 'delete'), asyncHandler(ctrl.removeLesson));

// ── Lesson Contents (permission 'konten', bukan 'kurikulum': isi pelajaran
// dikelola tim konten yang belum tentu boleh mengubah struktur kurikulum) ──
curriculumRouter.get(
  '/lessons/:lessonId/contents',
  requirePermission('konten', 'view'),
  asyncHandler(ctrl.listContents),
);
curriculumRouter.post(
  '/lessons/:lessonId/contents',
  requirePermission('konten', 'create'),
  validate(createContentSchema),
  asyncHandler(ctrl.createContent),
);
curriculumRouter.put(
  '/contents/:id',
  requirePermission('konten', 'update'),
  validate(updateContentSchema),
  asyncHandler(ctrl.updateContent),
);
curriculumRouter.delete('/contents/:id', requirePermission('konten', 'delete'), asyncHandler(ctrl.removeContent));
