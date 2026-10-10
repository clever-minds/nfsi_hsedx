import type { RouteRecordRaw } from 'vue-router';

export const enrollmentRoutes: RouteRecordRaw[] = [
  {
    path: 'enrollment',
    name: 'enrollment',
    component: () => import('@/modules/enrollment/views/EnrollmentListView.vue'),
    // Kelola enrollment/cohort. Instructor boleh view peserta kursusnya (BE row-scoped);
    // student/sub_user diblok walau punya enrollment.view (mereka pakai "Belajar Saya").
    meta: { permission: 'enrollment.view', hideForRoles: ['student', 'sub_user'], title: 'Enrollment' },
  },
];
