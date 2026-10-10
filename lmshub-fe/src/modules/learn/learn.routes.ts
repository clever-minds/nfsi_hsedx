import type { RouteRecordRaw } from 'vue-router';

export const learnRoutes: RouteRecordRaw[] = [
  {
    path: 'learn',
    name: 'my-courses',
    component: () => import('@/modules/learn/views/MyCoursesView.vue'),
    meta: {
      permission: 'enrollment.view',
      hideForRoles: ['director', 'chairperson', 'supervisor', 'operations_admin', 'marketing'],
      title: 'My Learning',
    },
  },
  {
    path: 'learn/:courseId',
    name: 'course-player',
    component: () => import('@/modules/learn/views/CoursePlayerView.vue'),
    meta: { permission: 'enrollment.view', title: 'Courses' },
  },
];
