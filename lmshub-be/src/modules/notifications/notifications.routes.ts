import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/rbac/requireAuth';
import { requirePermission } from '../../core/rbac/requirePermission';
import { validate } from '../../core/validation/validate';
import {
  createAnnouncementSchema,
  createMessageSchema,
  createReminderSchema,
  respondNotificationSchema,
  respondReminderSchema,
  updateEventConfigSchema,
} from './notifications.validation';
import * as ctrl from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth());

// Konfigurasi event → recipient × channel (admin/Super Admin/Direktur)
notificationsRouter.get(
  '/event-config',
  requirePermission('notification', 'view'),
  asyncHandler(ctrl.listEventConfig),
);
notificationsRouter.put(
  '/event-config/:jenisEvent',
  requirePermission('notification', 'update'),
  validate(updateEventConfigSchema),
  asyncHandler(ctrl.updateEventConfig),
);

// Pusat notification in-app milik user login (student hanya view miliknya)
notificationsRouter.get('/', requirePermission('notification', 'view'), asyncHandler(ctrl.listInbox));
notificationsRouter.post(
  '/:id/read',
  requirePermission('notification', 'update'),
  asyncHandler(ctrl.markRead),
);
notificationsRouter.post(
  '/:id/respond',
  requirePermission('notification', 'update'),
  validate(respondNotificationSchema),
  asyncHandler(ctrl.respond),
);

// Reminder
notificationsRouter.get('/reminders', requirePermission('notification', 'view'), asyncHandler(ctrl.listMyReminders));
notificationsRouter.get(
  '/reminders/monitor',
  requirePermission('notification', 'view'),
  asyncHandler(ctrl.monitorReminders),
);
notificationsRouter.post(
  '/reminders',
  requirePermission('notification', 'create'),
  validate(createReminderSchema),
  asyncHandler(ctrl.createReminder),
);
notificationsRouter.post(
  '/reminders/:id/read',
  requirePermission('notification', 'update'),
  asyncHandler(ctrl.markReminderRead),
);
notificationsRouter.post(
  '/reminders/:id/respond',
  requirePermission('notification', 'update'),
  validate(respondReminderSchema),
  asyncHandler(ctrl.respondReminder),
);

// Pengumuman / broadcast tersegment
notificationsRouter.get(
  '/announcements',
  requirePermission('notification', 'view'),
  asyncHandler(ctrl.listAnnouncements),
);
notificationsRouter.post(
  '/announcements',
  requirePermission('notification', 'create'),
  validate(createAnnouncementSchema),
  asyncHandler(ctrl.createAnnouncement),
);

// Pesan internal / inbox (permission terpisah: pesan)
notificationsRouter.get('/messages', requirePermission('messages', 'view'), asyncHandler(ctrl.listMessages));
notificationsRouter.post(
  '/messages',
  requirePermission('messages', 'create'),
  validate(createMessageSchema),
  asyncHandler(ctrl.sendMessage),
);
notificationsRouter.post(
  '/messages/:id/read',
  requirePermission('messages', 'update'),
  asyncHandler(ctrl.markMessageRead),
);
