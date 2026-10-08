import type { RouteRecordRaw } from 'vue-router';

export const coursesRoutes: RouteRecordRaw[] = [
  {
    path: 'courses',
    name: 'courses',
    component: () => import('@/modules/courses/views/CoursesListView.vue'),
    // course.create (bukan .view) — student punya course.view untuk catalog, bukan halaman kelola.
    meta: { permission: 'course.create', title: 'Courses' },
  },
  {
    path: 'courses/new',
    name: 'courses-create',
    component: () => import('@/modules/courses/views/CourseEditorView.vue'),
    meta: { permission: 'course.create', title: 'Add Course' },
  },
  {
    path: 'courses/:id',
    name: 'courses-edit',
    component: () => import('@/modules/courses/views/CourseEditorView.vue'),
    meta: { permission: 'course.update', title: 'Edit Course' },
    props: true,
  },
];
