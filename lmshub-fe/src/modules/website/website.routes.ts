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
  {
    path: 'website/blogs',
    name: 'website-blogs',
    component: () => import('@/modules/website/views/BlogManagementView.vue'),
    meta: { permission: 'content.view', title: 'Blog Posts' },
  },
  {
    path: 'website/blogs/create',
    name: 'website-blog-create',
    component: () => import('@/modules/website/views/BlogEditorView.vue'),
    meta: { permission: 'content.create', title: 'Create Blog Post' },
  },
  {
    path: 'website/blogs/:id/edit',
    name: 'website-blog-edit',
    component: () => import('@/modules/website/views/BlogEditorView.vue'),
    meta: { permission: 'content.update', title: 'Edit Blog Post' },
  },
  {
    path: 'blogs',
    name: 'admin-blogs',
    component: () => import('@/modules/website/views/BlogManagementView.vue'),
    meta: { permission: 'content.view', title: 'Blog Posts' },
  },
  {
    path: 'blogs/create',
    name: 'admin-blog-create',
    component: () => import('@/modules/website/views/BlogEditorView.vue'),
    meta: { permission: 'content.create', title: 'Create Blog Post' },
  },
  {
    path: 'blogs/:id/edit',
    name: 'admin-blog-edit',
    component: () => import('@/modules/website/views/BlogEditorView.vue'),
    meta: { permission: 'content.update', title: 'Edit Blog Post' },
  },
];
