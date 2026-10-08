import type { RouteRecordRaw } from 'vue-router';

export const contentRoutes: RouteRecordRaw[] = [
  {
    path: 'curriculum',
    name: 'content-curriculum',
    component: () => import('@/modules/content/views/CurriculumBuilderView.vue'),
    meta: { permission: 'kurikulum.view', title: 'Curriculum & Content' },
  },
  {
    path: 'media',
    name: 'content-media',
    component: () => import('@/modules/content/views/MediaLibraryView.vue'),
    meta: { permission: 'content.view', title: 'Media Library' },
  },
];
