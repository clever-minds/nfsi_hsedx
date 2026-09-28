import type { RouteRecordRaw } from 'vue-router';

// Rute modul Notifikasi & Reminder (C.15). Path relatif terhadap parent `/d`.
export const notificationsRoutes: RouteRecordRaw[] = [
  {
    path: 'notifications',
    name: 'notifikasi',
    component: () => import('@/modules/notifications/views/NotificationCenterView.vue'),
    meta: { title: 'Notifikasi' },
  },
  {
    path: 'notifications/preferences',
    name: 'notifikasi-preferensi',
    component: () => import('@/modules/notifications/views/PreferencesView.vue'),
    meta: { title: 'Preferensi Notifikasi' },
  },
  {
    path: 'notifications/monitor',
    name: 'notifikasi-monitor',
    component: () => import('@/modules/notifications/views/ReminderMonitorView.vue'),
    meta: { permission: 'notifikasi.view', title: 'Monitor Reminder' },
  },
];
