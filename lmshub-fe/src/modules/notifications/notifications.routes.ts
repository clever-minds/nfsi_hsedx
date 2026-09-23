import type { RouteRecordRaw } from 'vue-router';

// Rute modul Notifikasi & Reminder (C.15). Path relatif terhadap parent `/d`.
export const notificationsRoutes: RouteRecordRaw[] = [
  {
    path: 'notifikasi',
    name: 'notifikasi',
    component: () => import('@/modules/notifications/views/NotificationCenterView.vue'),
    meta: { title: 'Notifikasi' },
  },
  {
    path: 'notifikasi/preferensi',
    name: 'notifikasi-preferensi',
    component: () => import('@/modules/notifications/views/PreferencesView.vue'),
    meta: { title: 'Preferensi Notifikasi' },
  },
  {
    path: 'notifikasi/monitor',
    name: 'notifikasi-monitor',
    component: () => import('@/modules/notifications/views/ReminderMonitorView.vue'),
    meta: { permission: 'notifikasi.view', title: 'Monitor Reminder' },
  },
];
