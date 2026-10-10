import type { RouteRecordRaw } from 'vue-router';

// Rute modul Live Class & Kehadiran (C.9). Path relatif terhadap parent `/d`.
export const liveRoutes: RouteRecordRaw[] = [
  {
    path: 'live-class',
    name: 'live-class',
    component: () => import('@/modules/live/views/LiveClassView.vue'),
    meta: { permission: 'live_class.view', title: 'Live Class' },
  },
  {
    path: 'live-class/calendar',
    name: 'live-class-calendar',
    component: () => import('@/modules/live/views/CalendarView.vue'),
    meta: { permission: 'live_class.view', title: 'Calendar' },
  },
  {
    path: 'live-class/:id/attendance',
    name: 'live-class-attendance',
    component: () => import('@/modules/live/views/AttendanceView.vue'),
    meta: { permission: 'live_class.view', title: 'Session Attendance' },
  },
];
