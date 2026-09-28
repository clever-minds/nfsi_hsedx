<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, errorMessage } from '@/lib/api';
import CertificateDocument, { type CertData } from '@/components/CertificateDocument.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const cert = ref<CertData | null>(null);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    cert.value = await apiGet<CertData>(`/certificates/${route.params.id}/render`);
  } catch (e) {
    error.value = errorMessage(e, t('certificates.viewer.notFound'));
  } finally {
    loading.value = false;
  }
});

const cetak = () => window.print();
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between no-print">
      <button class="btn-outline text-sm" @click="router.back()">{{ t('certificates.viewer.back') }}</button>
      <button v-if="cert" class="btn-primary text-sm" @click="cetak">{{ t('certificates.viewer.print') }}</button>
    </div>
    <div v-if="loading" class="text-slate-400">{{ t('certificates.viewer.loading') }}</div>
    <div v-else-if="error" class="card p-6 text-slate-500">{{ error }}</div>
    <CertificateDocument v-else-if="cert" :cert="cert" />
  </div>
</template>

<style scoped>
@media print {
  .no-print { display: none !important; }
}
</style>
