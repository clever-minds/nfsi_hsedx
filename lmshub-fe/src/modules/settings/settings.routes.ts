import type { RouteRecordRaw } from 'vue-router';

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: 'pengaturan',
    name: 'pengaturan',
    component: () => import('@/modules/settings/views/SettingsView.vue'),
    meta: { permission: 'pengaturan.view', title: 'Pengaturan' },
  },
  {
    // Master data rekening transfer manual — dulu tiga baris di halaman Pengaturan.
    path: 'pengaturan/rekening',
    name: 'pengaturan-rekening',
    component: () => import('@/modules/settings/views/BankAccountsView.vue'),
    meta: { permission: 'pengaturan.view', title: 'Rekening Bank' },
  },
  {
    // Master data mata uang tampilan + kurs terhadap mata uang basis.
    path: 'pengaturan/mata-uang',
    name: 'pengaturan-mata-uang',
    component: () => import('@/modules/settings/views/CurrenciesView.vue'),
    meta: { permission: 'pengaturan.view', title: 'Mata Uang' },
  },
];
