import type { RouteRecordRaw } from 'vue-router';

// Rute modul Notifikasi & Reminder (C.15). Path relatif terhadap parent `/d`.
export const notificationsRoutes: RouteRecordRaw[] = [
  {
    path: 'notifications',
    name: 'notifications',
    component: () => import('@/modules/notifications/views/NotificationCenterView.vue'),
    meta: { title: 'Notifications' },
  },
  {
    path: 'notifications/preferences',
    name: 'notification-preferences',
    component: () => import('@/modules/notifications/views/PreferencesView.vue'),
    meta: { title: 'Notification Preferences' },
  },
  {
    path: 'notifications/monitor',
    name: 'notification-monitor',
    component: () => import('@/modules/notifications/views/ReminderMonitorView.vue'),
    meta: { permission: 'notification.view', title: 'Reminder Monitor' },
  },
];
