import type { RouteRecordRaw } from 'vue-router';

export const ordersRoutes: RouteRecordRaw[] = [
  {
    path: 'transactions',
    name: 'transactions',
    component: () => import('@/modules/orders/views/TransactionListView.vue'),
    meta: { permission: 'transaction.view', title: 'Transactions' },
  },
  {
    path: 'transactions/manual-payment',
    name: 'manual-payment',
    component: () => import('@/modules/orders/views/TandaJadiFormView.vue'),
    meta: { permission: 'transaction.create', title: 'Record Manual Payment' },
  },
];
