import type { RouteRecordRaw } from 'vue-router';

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: 'settings',
    name: 'settings',
    component: () => import('@/modules/settings/views/SettingsView.vue'),
    meta: { permission: 'settings.view', title: 'Settings' },
  },
  {
    // Master data account transfer manual — dulu tiga baris di halaman settings.
    path: 'settings/bank-accounts',
    name: 'bank-accounts',
    component: () => import('@/modules/settings/views/BankAccountsView.vue'),
    meta: { permission: 'settings.view', title: 'Bank Accounts' },
  },
  {
    // Master data mata uang tampilan + kurs terhadap mata uang basis.
    path: 'settings/currencies',
    name: 'currencies',
    component: () => import('@/modules/settings/views/CurrenciesView.vue'),
    meta: { permission: 'settings.view', title: 'Currencies' },
  },
];
