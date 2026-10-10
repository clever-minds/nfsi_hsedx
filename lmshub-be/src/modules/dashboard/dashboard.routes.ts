import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import * as ctrl from './dashboard.controller';

/**
 * Agregator KPI read-only per peran. Hanya `requireAuth` (tanpa `requirePermission`) —
 * data selalu difilter mensort_order `req.auth.userId`/`role` di service/repository, no pernah
 * membocorkan data lintas user/course/tim.
 */
export const dashboardRouter = Router();

dashboardRouter.use(requireAuth());

dashboardRouter.get('/student', asyncHandler(ctrl.student));
dashboardRouter.get('/instructor', asyncHandler(ctrl.instructor));
dashboardRouter.get('/admin', asyncHandler(ctrl.admin));
dashboardRouter.get('/direktur', asyncHandler(ctrl.direktur));
dashboardRouter.get('/ketua', asyncHandler(ctrl.ketua));
dashboardRouter.get('/pembina', asyncHandler(ctrl.pembina));
dashboardRouter.get('/marketing', asyncHandler(ctrl.marketing));

// Alias peran lain → dashboard yang paling relevan (kode peran from req.auth tetap men-scope data).
dashboardRouter.get('/super_admin', asyncHandler(ctrl.direktur)); // overview menyeluruh
dashboardRouter.get('/admin_ops', asyncHandler(ctrl.admin));
dashboardRouter.get('/asisten', asyncHandler(ctrl.instructor));
dashboardRouter.get('/sub_user', asyncHandler(ctrl.student));
