import type { RouteRecordRaw } from 'vue-router';

export const reportsRoutes: RouteRecordRaw[] = [
  {
    path: 'reports',
    name: 'laporan',
    component: () => import('@/modules/reports/views/LaporanView.vue'),
    meta: { permission: 'laporan.view', title: 'Laporan' },
  },
  {
    path: 'reports/payouts',
    name: 'laporan-payout',
    component: () => import('@/modules/reports/views/PayoutView.vue'),
    meta: { permission: 'laporan.view', title: 'Payout Instruktur' },
  },
];
