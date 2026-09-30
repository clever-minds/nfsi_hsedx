import type { RouteRecordRaw } from 'vue-router';

// Rute modul Diskusi & Komunitas (C.10). Path relatif terhadap parent `/d`.
export const discussionsRoutes: RouteRecordRaw[] = [
  {
    path: 'discussions',
    name: 'discussions',
    component: () => import('@/modules/discussions/views/DiscussionView.vue'),
    meta: { permission: 'diskusi.view', title: 'Discussions' },
  },
  {
    path: 'discussions/moderation',
    name: 'discussion-moderation',
    component: () => import('@/modules/discussions/views/ModerationView.vue'),
    meta: { permission: 'diskusi.delete', title: 'Discussion Moderation' },
  },
];
