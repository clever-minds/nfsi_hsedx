import type { RouteRecordRaw } from 'vue-router';

export const usersRoutes: RouteRecordRaw[] = [
  {
    // Profil sendiri — tanpa permission, tersedia untuk semua pengguna terautentikasi.
    path: 'profile',
    name: 'my-profile',
    component: () => import('@/modules/users/views/ProfileView.vue'),
    meta: { title: 'Profil Saya' },
  },
  {
    path: 'users',
    name: 'users',
    component: () => import('@/modules/users/views/UsersListView.vue'),
    meta: { permission: 'pengguna.view', title: 'Pengguna' },
  },
  {
    path: 'users/add',
    name: 'users-create',
    component: () => import('@/modules/users/views/UserFormView.vue'),
    meta: { permission: 'pengguna.create', title: 'Tambah Pengguna' },
  },
  {
    path: 'users/:id/edit',
    name: 'users-edit',
    component: () => import('@/modules/users/views/UserFormView.vue'),
    meta: { permission: 'pengguna.update', title: 'Ubah Pengguna' },
    props: true,
  },
];
