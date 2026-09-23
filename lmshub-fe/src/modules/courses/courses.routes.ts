import type { RouteRecordRaw } from 'vue-router';

export const coursesRoutes: RouteRecordRaw[] = [
  {
    path: 'kursus',
    name: 'courses',
    component: () => import('@/modules/courses/views/CoursesListView.vue'),
    // kursus.create (bukan .view) — siswa punya kursus.view untuk katalog, bukan halaman kelola.
    meta: { permission: 'kursus.create', title: 'Kursus' },
  },
  {
    path: 'kursus/tambah',
    name: 'courses-create',
    component: () => import('@/modules/courses/views/CourseEditorView.vue'),
    meta: { permission: 'kursus.create', title: 'Tambah Kursus' },
  },
  {
    path: 'kursus/:id',
    name: 'courses-edit',
    component: () => import('@/modules/courses/views/CourseEditorView.vue'),
    meta: { permission: 'kursus.update', title: 'Sunting Kursus' },
    props: true,
  },
];
