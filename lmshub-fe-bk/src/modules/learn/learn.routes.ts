import type { RouteRecordRaw } from 'vue-router';

export const learnRoutes: RouteRecordRaw[] = [
  {
    path: 'belajar',
    name: 'my-courses',
    component: () => import('@/modules/learn/views/MyCoursesView.vue'),
    meta: {
      permission: 'enrollment.view',
      hideForRoles: ['direktur', 'ketua', 'pembina', 'admin_ops', 'marketing'],
      title: 'Belajar Saya',
    },
  },
  {
    path: 'belajar/:courseId',
    name: 'course-player',
    component: () => import('@/modules/learn/views/CoursePlayerView.vue'),
    meta: { permission: 'enrollment.view', title: 'Kursus' },
  },
];
