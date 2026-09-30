import type { RouteRecordRaw } from 'vue-router';

export const coursesRoutes: RouteRecordRaw[] = [
  {
    path: 'courses',
    name: 'courses',
    component: () => import('@/modules/courses/views/CoursesListView.vue'),
    // kursus.create (bukan .view) — siswa punya kursus.view untuk katalog, bukan halaman kelola.
    meta: { permission: 'kursus.create', title: 'Courses' },
  },
  {
    path: 'courses/new',
    name: 'courses-create',
    component: () => import('@/modules/courses/views/CourseEditorView.vue'),
    meta: { permission: 'kursus.create', title: 'Add Course' },
  },
  {
    path: 'courses/:id',
    name: 'courses-edit',
    component: () => import('@/modules/courses/views/CourseEditorView.vue'),
    meta: { permission: 'kursus.update', title: 'Edit Course' },
    props: true,
  },
];
