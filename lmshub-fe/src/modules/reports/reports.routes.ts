import type { RouteRecordRaw } from 'vue-router';

export const reportsRoutes: RouteRecordRaw[] = [
  {
    path: 'laporan',
    name: 'laporan',
    component: () => import('@/modules/reports/views/LaporanView.vue'),
    meta: { permission: 'laporan.view', title: 'Laporan' },
  },
  {
    path: 'laporan/payout',
    name: 'laporan-payout',
    component: () => import('@/modules/reports/views/PayoutView.vue'),
    meta: { permission: 'laporan.view', title: 'Payout Instruktur' },
  },
];
