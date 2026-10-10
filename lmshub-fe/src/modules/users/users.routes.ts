import type { RouteRecordRaw } from 'vue-router';

export const usersRoutes: RouteRecordRaw[] = [
  {
    // profile sendiri — tanpa permission, tersedia untuk semua user terautentikasi.
    path: 'profile',
    name: 'my-profile',
    component: () => import('@/modules/users/views/ProfileView.vue'),
    meta: { title: 'My Profile' },
  },
  {
    path: 'users',
    name: 'users',
    component: () => import('@/modules/users/views/UsersListView.vue'),
    meta: { permission: 'user.view', title: 'Users' },
  },
  {
    path: 'users/new',
    name: 'users-create',
    component: () => import('@/modules/users/views/UserFormView.vue'),
    meta: { permission: 'user.create', title: 'Add User' },
  },
  {
    path: 'users/:id/edit',
    name: 'users-edit',
    component: () => import('@/modules/users/views/UserFormView.vue'),
    meta: { permission: 'user.update', title: 'Edit User' },
    props: true,
  },
];
