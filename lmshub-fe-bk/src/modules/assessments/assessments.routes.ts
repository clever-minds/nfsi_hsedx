import type { RouteRecordRaw } from 'vue-router';

export const assessmentsRoutes: RouteRecordRaw[] = [
  {
    path: 'asesmen',
    name: 'assessments',
    component: () => import('@/modules/assessments/views/AssessmentListView.vue'),
    meta: { permission: 'asesmen.view', title: 'Asesmen' },
  },
  {
    path: 'asesmen/kuis/tambah',
    name: 'quiz-create',
    component: () => import('@/modules/assessments/views/QuizBuilderView.vue'),
    meta: { permission: 'asesmen.create', title: 'Buat Kuis' },
  },
  {
    path: 'asesmen/kuis/:id',
    name: 'quiz-edit',
    component: () => import('@/modules/assessments/views/QuizBuilderView.vue'),
    meta: { permission: 'asesmen.update', title: 'Sunting Kuis' },
  },
  {
    path: 'asesmen/kuis/:quizId/kerjakan',
    name: 'quiz-attempt',
    component: () => import('@/modules/assessments/views/QuizAttemptView.vue'),
    meta: { permission: 'enrollment.view', title: 'Kerjakan Kuis' },
  },
];
