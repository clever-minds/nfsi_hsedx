<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BrandMark from '@/components/ui/BrandMark.vue';
import CurrencySwitcher from '@/components/ui/CurrencySwitcher.vue';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue';
import { useAppConfigStore } from '@/stores/appConfig';

defineProps<{ title: string; subtitle?: string }>();

const { t } = useI18n();
const appConfig = useAppConfigStore();
const tahun = new Date().getFullYear();
</script>

<template>
  <div class="auth-bg relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
    <!-- Pemilih bahasa: harus tersedia sebelum login, bukan hanya di dalam app -->
    <div class="absolute end-4 top-4">
      <CurrencySwitcher />
      <LocaleSwitcher />
    </div>

    <!-- Logo -->
    <RouterLink to="/" class="mb-8">
      <BrandMark size="lg" />
    </RouterLink>

    <!-- Card -->
    <div class="card w-full max-w-md px-6 py-10 sm:px-10">
      <h1 class="text-center text-2xl font-bold text-slate-900">{{ title }}</h1>
      <p v-if="subtitle" class="mt-2 text-center text-sm text-slate-500">{{ subtitle }}</p>
      <div class="mt-8">
        <slot />
      </div>
    </div>

    <!-- Footer -->
    <footer class="mt-10 flex items-center gap-2 text-sm text-slate-400">
      <template v-if="appConfig.footerText">{{ appConfig.footerText }}</template>
      <template v-else>{{ t('auth.copyright', { year: tahun, name: appConfig.appName }) }}</template>
    </footer>
  </div>
</template>
