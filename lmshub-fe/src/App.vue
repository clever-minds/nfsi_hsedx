<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useAppConfigStore } from '@/stores/appConfig';
import { useSiteContentStore } from '@/stores/siteContent';
import { useCurrencyStore } from '@/stores/currency';

const auth = useAuthStore();
const appConfig = useAppConfigStore();
const siteContent = useSiteContentStore();
const currency = useCurrencyStore();

onMounted(() => {
  if (!auth.ready) auth.bootstrap();
  // Mata uang dipakai katalog pra-login juga, jadi dimuat tanpa menunggu sesi.
  appConfig.bootstrap();
  // Daftar mata uang + kurs: tanpa ini setiap harga jatuh ke mata uang basis.
  currency.bootstrap();
  // Header & footer digambar di semua halaman — muat isinya sedini mungkin.
  siteContent.bootstrap();
});
</script>

<template>
  <RouterView />
</template>
