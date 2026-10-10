import type { RouteRecordRaw } from 'vue-router';

export const reportsRoutes: RouteRecordRaw[] = [
  {
    path: 'reports',
    name: 'reports',
    component: () => import('@/modules/reports/views/ReportView.vue'),
    meta: { permission: 'report.view', title: 'Reports' },
  },
  {
    path: 'reports/payouts',
    name: 'payouts',
    component: () => import('@/modules/reports/views/PayoutView.vue'),
    meta: { permission: 'report.view', title: 'Instructor Payouts' },
  },
];
