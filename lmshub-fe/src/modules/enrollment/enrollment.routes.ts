import type { RouteRecordRaw } from 'vue-router';

export const enrollmentRoutes: RouteRecordRaw[] = [
  {
    path: 'enrollment',
    name: 'enrollment',
    component: () => import('@/modules/enrollment/views/EnrollmentListView.vue'),
    // Kelola enrollment/cohort. Instruktur boleh lihat peserta kursusnya (BE row-scoped);
    // siswa/sub_user diblok walau punya enrollment.view (mereka pakai "Belajar Saya").
    meta: { permission: 'enrollment.view', hideForRoles: ['siswa', 'sub_user'], title: 'Enrollment' },
  },
];
