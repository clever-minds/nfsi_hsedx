import type { RouteRecordRaw } from 'vue-router';

// Rute modul Diskusi & Komunitas (C.10). Path relatif terhadap parent `/d`.
export const discussionsRoutes: RouteRecordRaw[] = [
  {
    path: 'diskusi',
    name: 'diskusi',
    component: () => import('@/modules/discussions/views/DiscussionView.vue'),
    meta: { permission: 'diskusi.view', title: 'Diskusi' },
  },
  {
    path: 'diskusi/moderasi',
    name: 'diskusi-moderasi',
    component: () => import('@/modules/discussions/views/ModerationView.vue'),
    meta: { permission: 'diskusi.delete', title: 'Moderasi Diskusi' },
  },
];
