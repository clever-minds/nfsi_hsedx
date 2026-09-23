import type { RouteRecordRaw } from 'vue-router';

export const websiteRoutes: RouteRecordRaw[] = [
  {
    // Isi halaman publik (kontak, hero, susunan seksi, footer). Dijaga izin yang
    // sama dengan Pengaturan — keduanya mengubah tampilan untuk semua pengunjung.
    path: 'website',
    name: 'website',
    component: () => import('@/modules/website/views/WebsiteView.vue'),
    meta: { permission: 'pengaturan.view', title: 'Website' },
  },
];
