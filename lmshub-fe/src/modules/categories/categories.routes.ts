import type { RouteRecordRaw } from 'vue-router';

export const categoriesRoutes: RouteRecordRaw[] = [
  {
    // Master data kategori & tag kursus.
    // Gerbangnya `kategori.create`, BUKAN `kategori.view` — izin view juga
    // dimiliki siswa (dipakai katalog publik), jadi memakainya akan membuka
    // layar master data untuk mereka. Pola yang sama dipakai halaman Kursus.
    path: 'categories',
    name: 'categories',
    component: () => import('@/modules/categories/views/CategoriesView.vue'),
    meta: { permission: 'kategori.create', title: 'Course Categories' },
  },
];
