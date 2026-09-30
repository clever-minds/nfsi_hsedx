import type { RouteRecordRaw } from 'vue-router';

export const marketingRoutes: RouteRecordRaw[] = [
  {
    path: 'marketing',
    name: 'marketing',
    component: () => import('@/modules/marketing/views/MarketingDashboardView.vue'),
    meta: { permission: 'marketing.view', title: 'Marketing' },
  },
  {
    // Kode kupon. Penukarannya sudah jalan di checkout sejak awal; layar ini
    // yang membuatnya bisa dibuat tanpa menyentuh basis data.
    path: 'marketing/coupons',
    name: 'marketing-coupons',
    component: () => import('@/modules/marketing/views/CouponsView.vue'),
    meta: { permission: 'marketing.view', title: 'Coupons' },
  },
];
