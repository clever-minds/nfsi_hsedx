import type { RouteRecordRaw } from 'vue-router';

export const contentRoutes: RouteRecordRaw[] = [
  {
    path: 'content',
    name: 'content-curriculum',
    component: () => import('@/modules/content/views/CurriculumBuilderView.vue'),
    meta: { permission: 'kurikulum.view', title: 'Kurikulum & Konten' },
  },
  {
    path: 'content/media',
    name: 'content-media',
    component: () => import('@/modules/content/views/MediaLibraryView.vue'),
    meta: { permission: 'konten.view', title: 'Media Library' },
  },
];
