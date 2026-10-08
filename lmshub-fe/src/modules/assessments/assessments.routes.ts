import type { RouteRecordRaw } from 'vue-router';

export const assessmentsRoutes: RouteRecordRaw[] = [
  {
    path: 'assessments',
    name: 'assessments',
    component: () => import('@/modules/assessments/views/AssessmentListView.vue'),
    meta: { permission: 'assessment.view', title: 'Assessments' },
  },
  {
    // Soal di dalam satu bank soal (tambah/ubah/hapus).
    path: 'assessments/banks/:id',
    name: 'question-bank',
    component: () => import('@/modules/assessments/views/QuestionBankView.vue'),
    meta: { permission: 'bank_soal.view', title: 'Question Bank' },
  },
  {
    path: 'assessments/quizzes/new',
    name: 'quiz-create',
    component: () => import('@/modules/assessments/views/QuizBuilderView.vue'),
    meta: { permission: 'assessment.create', title: 'Create Quiz' },
  },
  {
    path: 'assessments/quizzes/:id',
    name: 'quiz-edit',
    component: () => import('@/modules/assessments/views/QuizBuilderView.vue'),
    meta: { permission: 'assessment.update', title: 'Edit Quiz' },
  },
  {
    path: 'assessments/quizzes/:quizId/take',
    name: 'quiz-attempt',
    component: () => import('@/modules/assessments/views/QuizAttemptView.vue'),
    meta: { permission: 'enrollment.view', title: 'Take Quiz' },
  },
];
