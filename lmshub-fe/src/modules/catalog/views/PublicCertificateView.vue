<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, errorMessage } from '@/lib/api';
import CertificateDocument, { type CertData } from '@/components/CertificateDocument.vue';

interface VerifyResult extends CertData {
  status: 'valid' | 'dibatalkan' | 'tidak_ditemukan';
}

const route = useRoute();
const { t } = useI18n();
const result = ref<VerifyResult | null>(null);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    result.value = await apiGet<VerifyResult>(`/public/certificates/verify/${route.params.nomor}`);
  } catch (e) {
    error.value = errorMessage(e, t('catalog.verify.failed'));
  } finally {
    loading.value = false;
  }
});

const valid = computed(() => result.value?.status === 'valid');
const cetak = () => window.print();
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-10">
    <div v-if="loading" class="text-center text-slate-400">{{ t('catalog.verify.verifying') }}</div>
    <div v-else-if="error" class="card p-6 text-center text-slate-500">{{ error }}</div>
    <template v-else-if="result">
      <!-- Banner status -->
      <div
        class="mb-6 flex items-center justify-between rounded-xl px-5 py-4 no-print"
        :class="valid ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'"
      >
        <div>
          <div class="font-semibold">
            {{
              valid
                ? t('catalog.verify.valid')
                : result.status === 'dibatalkan'
                  ? t('catalog.verify.cancelled')
                  : t('catalog.verify.notFound')
            }}
          </div>
          <div class="text-sm opacity-80">{{ t('catalog.verify.number', { value: route.params.nomor }) }}</div>
        </div>
        <button v-if="valid" class="btn-primary text-sm" @click="cetak">🖶 {{ t('catalog.verify.print') }}</button>
      </div>

      <CertificateDocument v-if="valid" :cert="result" />
      <div v-else class="empty-state">{{ t('catalog.verify.invalidBody') }}</div>
    </template>
  </div>
</template>

<style scoped>
@media print {
  .no-print { display: none !important; }
}
</style>
