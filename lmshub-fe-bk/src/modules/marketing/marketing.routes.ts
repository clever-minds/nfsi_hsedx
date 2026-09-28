import type { RouteRecordRaw } from 'vue-router';

export const marketingRoutes: RouteRecordRaw[] = [
  {
    path: 'marketing',
    name: 'marketing',
    component: () => import('@/modules/marketing/views/MarketingDashboardView.vue'),
    meta: { permission: 'marketing.view', title: 'Marketing' },
  },
];
