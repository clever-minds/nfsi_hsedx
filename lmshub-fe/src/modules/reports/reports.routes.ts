import type { RouteRecordRaw } from 'vue-router';

export const reportsRoutes: RouteRecordRaw[] = [
  {
    path: 'reports',
    name: 'reports',
    component: () => import('@/modules/reports/views/LaporanView.vue'),
    meta: { permission: 'laporan.view', title: 'Reports' },
  },
  {
    path: 'reports/payouts',
    name: 'payouts',
    component: () => import('@/modules/reports/views/PayoutView.vue'),
    meta: { permission: 'laporan.view', title: 'Instructor Payouts' },
  },
];
