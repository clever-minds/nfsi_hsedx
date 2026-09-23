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

// Konfigurasi event → penerima × kanal (admin/Super Admin/Direktur)
notificationsRouter.get(
  '/event-config',
  requirePermission('notifikasi', 'view'),
  asyncHandler(ctrl.listEventConfig),
);
notificationsRouter.put(
  '/event-config/:jenisEvent',
  requirePermission('notifikasi', 'update'),
  validate(updateEventConfigSchema),
  asyncHandler(ctrl.updateEventConfig),
);

// Pusat notifikasi in-app milik pengguna login (siswa hanya lihat miliknya)
notificationsRouter.get('/', requirePermission('notifikasi', 'view'), asyncHandler(ctrl.listInbox));
notificationsRouter.post(
  '/:id/read',
  requirePermission('notifikasi', 'update'),
  asyncHandler(ctrl.markRead),
);
notificationsRouter.post(
  '/:id/respond',
  requirePermission('notifikasi', 'update'),
  validate(respondNotificationSchema),
  asyncHandler(ctrl.respond),
);

// Reminder
notificationsRouter.get('/reminders', requirePermission('notifikasi', 'view'), asyncHandler(ctrl.listMyReminders));
notificationsRouter.get(
  '/reminders/monitor',
  requirePermission('notifikasi', 'view'),
  asyncHandler(ctrl.monitorReminders),
);
notificationsRouter.post(
  '/reminders',
  requirePermission('notifikasi', 'create'),
  validate(createReminderSchema),
  asyncHandler(ctrl.createReminder),
);
notificationsRouter.post(
  '/reminders/:id/read',
  requirePermission('notifikasi', 'update'),
  asyncHandler(ctrl.markReminderRead),
);
notificationsRouter.post(
  '/reminders/:id/respond',
  requirePermission('notifikasi', 'update'),
  validate(respondReminderSchema),
  asyncHandler(ctrl.respondReminder),
);

// Pengumuman / broadcast tersegmen
notificationsRouter.get(
  '/announcements',
  requirePermission('notifikasi', 'view'),
  asyncHandler(ctrl.listAnnouncements),
);
notificationsRouter.post(
  '/announcements',
  requirePermission('notifikasi', 'create'),
  validate(createAnnouncementSchema),
  asyncHandler(ctrl.createAnnouncement),
);

// Pesan internal / inbox (permission terpisah: pesan)
notificationsRouter.get('/messages', requirePermission('pesan', 'view'), asyncHandler(ctrl.listMessages));
notificationsRouter.post(
  '/messages',
  requirePermission('pesan', 'create'),
  validate(createMessageSchema),
  asyncHandler(ctrl.sendMessage),
);
notificationsRouter.post(
  '/messages/:id/read',
  requirePermission('pesan', 'update'),
  asyncHandler(ctrl.markMessageRead),
);
