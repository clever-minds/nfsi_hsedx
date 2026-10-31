import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createBlogSchema, submitBlogQuizSchema, updateBlogSchema } from './blogs.validation';
import * as ctrl from './blogs.controller';

export const blogsRouter = Router();

// PUBLIC routes (accessible without login)
blogsRouter.get('/public', asyncHandler(ctrl.listPublic));
blogsRouter.get('/public/categories', asyncHandler(ctrl.listCategories));
blogsRouter.get('/public/:slug', asyncHandler(ctrl.getPublicDetail));
blogsRouter.post(
  '/public/:slug/quiz/submit',
  validate(submitBlogQuizSchema),
  asyncHandler(ctrl.submitQuiz),
);
blogsRouter.get('/share/:slug', asyncHandler(ctrl.renderBlogSocialPreview));
blogsRouter.get('/preview/:slug', asyncHandler(ctrl.renderBlogSocialPreview));

// ADMIN / DASHBOARD routes
blogsRouter.get('/', requireAuth(), requirePermission('content', 'view'), asyncHandler(ctrl.listAdmin));
blogsRouter.get('/categories', requireAuth(), requirePermission('content', 'view'), asyncHandler(ctrl.listCategories));
blogsRouter.get('/:id', requireAuth(), requirePermission('content', 'view'), asyncHandler(ctrl.getAdminDetail));
blogsRouter.post(
  '/',
  requireAuth(),
  requirePermission('content', 'create'),
  validate(createBlogSchema),
  asyncHandler(ctrl.createAdmin),
);
blogsRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('content', 'update'),
  validate(updateBlogSchema),
  asyncHandler(ctrl.updateAdmin),
);
blogsRouter.delete(
  '/:id',
  requireAuth(),
  requirePermission('content', 'delete'),
  asyncHandler(ctrl.deleteAdmin),
);
