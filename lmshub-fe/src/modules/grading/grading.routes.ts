import type { RouteRecordRaw } from 'vue-router';

export const gradingRoutes: RouteRecordRaw[] = [
  {
    path: 'grading',
    name: 'grading-queue',
    component: () => import('@/modules/grading/views/GradingQueueView.vue'),
    meta: { permission: 'grading.view', title: 'Grading' },
  },
  {
    path: 'grading/gradebook/:courseId?',
    name: 'gradebook',
    component: () => import('@/modules/grading/views/GradebookView.vue'),
    meta: { permission: 'grading.view', title: 'Gradebook' },
  },
];
