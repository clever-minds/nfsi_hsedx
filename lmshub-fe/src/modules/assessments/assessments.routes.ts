import type { RouteRecordRaw } from 'vue-router';

export const assessmentsRoutes: RouteRecordRaw[] = [
  {
    path: 'assessments',
    name: 'assessments',
    component: () => import('@/modules/assessments/views/AssessmentListView.vue'),
    meta: { permission: 'asesmen.view', title: 'Assessments' },
  },
  {
    path: 'assessments/quizzes/new',
    name: 'quiz-create',
    component: () => import('@/modules/assessments/views/QuizBuilderView.vue'),
    meta: { permission: 'asesmen.create', title: 'Create Quiz' },
  },
  {
    path: 'assessments/quizzes/:id',
    name: 'quiz-edit',
    component: () => import('@/modules/assessments/views/QuizBuilderView.vue'),
    meta: { permission: 'asesmen.update', title: 'Edit Quiz' },
  },
  {
    path: 'assessments/quizzes/:quizId/take',
    name: 'quiz-attempt',
    component: () => import('@/modules/assessments/views/QuizAttemptView.vue'),
    meta: { permission: 'enrollment.view', title: 'Take Quiz' },
  },
];
