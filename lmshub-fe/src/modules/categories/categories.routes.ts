import type { RouteRecordRaw } from 'vue-router';

export const categoriesRoutes: RouteRecordRaw[] = [
  {
    // Master data category & tag course.
    // Gerbangnya `category.create`, BUKAN `category.view` — izin view juga
    // dimiliki student (dipakai catalog publik), jadi memakainya akan membuka
    // layar master data untuk mereka. Pola yang sama dipakai halaman Course.
    path: 'categories',
    name: 'categories',
    component: () => import('@/modules/categories/views/CategoriesView.vue'),
    meta: { permission: 'category.create', title: 'Course Categories' },
  },
];
