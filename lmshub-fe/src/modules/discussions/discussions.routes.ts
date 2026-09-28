import type { RouteRecordRaw } from 'vue-router';

// Rute modul Diskusi & Komunitas (C.10). Path relatif terhadap parent `/d`.
export const discussionsRoutes: RouteRecordRaw[] = [
  {
    path: 'discussions',
    name: 'diskusi',
    component: () => import('@/modules/discussions/views/DiscussionView.vue'),
    meta: { permission: 'diskusi.view', title: 'Diskusi' },
  },
  {
    path: 'discussions/moderation',
    name: 'diskusi-moderasi',
    component: () => import('@/modules/discussions/views/ModerationView.vue'),
    meta: { permission: 'diskusi.delete', title: 'Moderasi Diskusi' },
  },
];
