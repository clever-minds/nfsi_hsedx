import type { RouteRecordRaw } from 'vue-router';

export const websiteRoutes: RouteRecordRaw[] = [
  {
    // Isi halaman publik (kontak, hero, susunan seksi, footer). Dijaga izin yang
    // sama dengan settings — keduanya mengubah tampilan untuk semua pengunjung.
    path: 'website',
    name: 'website',
    component: () => import('@/modules/website/views/WebsiteView.vue'),
    meta: { permission: 'settings.view', title: 'Website' },
  },
  {
    // Halaman statis (About, Help Center, Privacy, Terms, Contact, …) yang
    // ditautkan footer. Izin `settings` — sama dengan backend.
    path: 'website/pages',
    name: 'website-pages',
    component: () => import('@/modules/website/views/PagesView.vue'),
    meta: { permission: 'settings.view', title: 'Pages' },
  },
];
