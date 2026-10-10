import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import { createCategorySchema, createTagSchema, updateCategorySchema, updateTagSchema } from './categories.validation';
import * as ctrl from './categories.controller';

export const categoriesRouter = Router();

// PUBLIC — catalog category & tag (dikonsumsi rute pra-login lmshub-fe)
categoriesRouter.get('/public', asyncHandler(ctrl.publicList));
categoriesRouter.get('/public/:slug', asyncHandler(ctrl.publicDetail));
categoriesRouter.get('/tags/public', asyncHandler(ctrl.publicTagList));

// ── Categories (dashboard) ──────────────────────────
categoriesRouter.get('/', requireAuth(), requirePermission('category', 'view'), asyncHandler(ctrl.list));
categoriesRouter.post(
  '/',
  requireAuth(),
  requirePermission('category', 'create'),
  validate(createCategorySchema),
  asyncHandler(ctrl.create),
);

// ── Tags (dashboard) — didaftarkan sebelum '/:id' agar 'tags' no tertangkap sebagai :id
categoriesRouter.get('/tags', requireAuth(), requirePermission('category', 'view'), asyncHandler(ctrl.tagList));
categoriesRouter.post(
  '/tags',
  requireAuth(),
  requirePermission('category', 'create'),
  validate(createTagSchema),
  asyncHandler(ctrl.tagCreate),
);
categoriesRouter.get('/tags/:id', requireAuth(), requirePermission('category', 'view'), asyncHandler(ctrl.tagDetail));
categoriesRouter.put(
  '/tags/:id',
  requireAuth(),
  requirePermission('category', 'update'),
  validate(updateTagSchema),
  asyncHandler(ctrl.tagUpdate),
);
categoriesRouter.delete('/tags/:id', requireAuth(), requirePermission('category', 'delete'), asyncHandler(ctrl.tagRemove));

// ── Categories (dashboard, lanjutan) ────────────────
categoriesRouter.get('/:id', requireAuth(), requirePermission('category', 'view'), asyncHandler(ctrl.detail));
categoriesRouter.put(
  '/:id',
  requireAuth(),
  requirePermission('category', 'update'),
  validate(updateCategorySchema),
  asyncHandler(ctrl.update),
);
categoriesRouter.delete('/:id', requireAuth(), requirePermission('category', 'delete'), asyncHandler(ctrl.remove));
