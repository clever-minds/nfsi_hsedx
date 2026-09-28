<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
    <div class="font-serif text-6xl font-bold text-brand-800">404</div>
    <p class="text-slate-500">{{ t('dashboard.notFound.message') }}</p>
    <RouterLink to="/" class="btn-primary mt-2">{{ t('dashboard.notFound.back') }}</RouterLink>
  </div>
</template>
