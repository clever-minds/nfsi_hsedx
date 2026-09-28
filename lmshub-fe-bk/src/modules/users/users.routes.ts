import type { RouteRecordRaw } from 'vue-router';

export const usersRoutes: RouteRecordRaw[] = [
  {
    // Profil sendiri — tanpa permission, tersedia untuk semua pengguna terautentikasi.
    path: 'profil',
    name: 'my-profile',
    component: () => import('@/modules/users/views/ProfileView.vue'),
    meta: { title: 'Profil Saya' },
  },
  {
    path: 'pengguna',
    name: 'users',
    component: () => import('@/modules/users/views/UsersListView.vue'),
    meta: { permission: 'pengguna.view', title: 'Pengguna' },
  },
  {
    path: 'pengguna/tambah',
    name: 'users-create',
    component: () => import('@/modules/users/views/UserFormView.vue'),
    meta: { permission: 'pengguna.create', title: 'Tambah Pengguna' },
  },
  {
    path: 'pengguna/:id/ubah',
    name: 'users-edit',
    component: () => import('@/modules/users/views/UserFormView.vue'),
    meta: { permission: 'pengguna.update', title: 'Ubah Pengguna' },
    props: true,
  },
];
