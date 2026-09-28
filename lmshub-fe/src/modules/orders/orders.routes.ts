import type { RouteRecordRaw } from 'vue-router';

export const ordersRoutes: RouteRecordRaw[] = [
  {
    path: 'transaksi',
    name: 'transaksi',
    component: () => import('@/modules/orders/views/TransaksiListView.vue'),
    meta: { permission: 'transaksi.view', title: 'Transaksi' },
  },
  {
    path: 'transaksi/tanda-jadi',
    name: 'transaksi-tanda-jadi',
    component: () => import('@/modules/orders/views/TandaJadiFormView.vue'),
    meta: { permission: 'transaksi.create', title: 'Input Tanda Jadi' },
  },
];
