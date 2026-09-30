import type { RouteRecordRaw } from 'vue-router';

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: 'settings',
    name: 'settings',
    component: () => import('@/modules/settings/views/SettingsView.vue'),
    meta: { permission: 'pengaturan.view', title: 'Settings' },
  },
  {
    // Master data rekening transfer manual — dulu tiga baris di halaman Pengaturan.
    path: 'settings/bank-accounts',
    name: 'bank-accounts',
    component: () => import('@/modules/settings/views/BankAccountsView.vue'),
    meta: { permission: 'pengaturan.view', title: 'Bank Accounts' },
  },
  {
    // Master data mata uang tampilan + kurs terhadap mata uang basis.
    path: 'settings/currencies',
    name: 'currencies',
    component: () => import('@/modules/settings/views/CurrenciesView.vue'),
    meta: { permission: 'pengaturan.view', title: 'Currencies' },
  },
];
