import type { RouteRecordRaw } from 'vue-router';

export const ordersRoutes: RouteRecordRaw[] = [
  {
    path: 'transactions',
    name: 'transactions',
    component: () => import('@/modules/orders/views/TransaksiListView.vue'),
    meta: { permission: 'transaksi.view', title: 'Transactions' },
  },
  {
    path: 'transactions/manual-payment',
    name: 'manual-payment',
    component: () => import('@/modules/orders/views/TandaJadiFormView.vue'),
    meta: { permission: 'transaksi.create', title: 'Record Manual Payment' },
  },
];
