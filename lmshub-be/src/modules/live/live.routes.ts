import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createLiveSessionSchema,
  updateLiveSessionSchema,
  markAttendanceSchema,
  createRecordingSchema,
  publishAsLessonSchema,
} from './live.validation';
import * as ctrl from './live.controller';

export const liveRouter = Router();

liveRouter.use(requireAuth());

// Kalender terpadu (live class + agenda kursus) untuk pengguna login
liveRouter.get('/calendar', requirePermission('live_class', 'view'), asyncHandler(ctrl.calendar));

// Sesi live
liveRouter.get('/live-sessions', requirePermission('live_class', 'view'), asyncHandler(ctrl.list));
liveRouter.post(
  '/live-sessions',
  requirePermission('live_class', 'create'),
  validate(createLiveSessionSchema),
  asyncHandler(ctrl.schedule),
);
liveRouter.get('/live-sessions/:id', requirePermission('live_class', 'view'), asyncHandler(ctrl.detail));
liveRouter.put(
  '/live-sessions/:id',
  requirePermission('live_class', 'update'),
  validate(updateLiveSessionSchema),
  asyncHandler(ctrl.update),
);
liveRouter.delete('/live-sessions/:id', requirePermission('live_class', 'delete'), asyncHandler(ctrl.cancel));
liveRouter.post('/live-sessions/:id/start', requirePermission('live_class', 'update'), asyncHandler(ctrl.start));
liveRouter.post('/live-sessions/:id/end', requirePermission('live_class', 'update'), asyncHandler(ctrl.end));
liveRouter.post('/live-sessions/:id/join', requirePermission('live_class', 'view'), asyncHandler(ctrl.join));

// Kehadiran
liveRouter.get(
  '/live-sessions/:id/attendance',
  requirePermission('kehadiran', 'view'),
  asyncHandler(ctrl.listAttendance),
);
liveRouter.post(
  '/live-sessions/:id/attendance',
  requirePermission('kehadiran', 'update'),
  validate(markAttendanceSchema),
  asyncHandler(ctrl.markAttendance),
);

// Rekaman
liveRouter.get(
  '/recordings/:liveSessionId',
  requirePermission('live_class', 'view'),
  asyncHandler(ctrl.listRecordings),
);
liveRouter.post(
  '/live-sessions/:id/recordings',
  requirePermission('live_class', 'update'),
  validate(createRecordingSchema),
  asyncHandler(ctrl.addRecording),
);
liveRouter.post(
  '/recordings/:id/publish-as-lesson',
  requirePermission('live_class', 'update'),
  validate(publishAsLessonSchema),
  asyncHandler(ctrl.publishAsLesson),
);
