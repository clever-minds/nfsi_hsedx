<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAppConfigStore } from '@/stores/appConfig';
import { apiGet, errorMessage } from '@/lib/api';
import CertificateDocument, { type CertData } from '@/components/CertificateDocument.vue';

interface VerifyResult extends CertData {
  status: 'valid' | 'cancelled' | 'tidak_ditemukan';
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const appConfig = useAppConfigStore();

const result = ref<VerifyResult | null>(null);
const loading = ref(false);
const error = ref('');
const inputNumber = ref((route.params.number as string) || (route.query.code as string) || '');

async function fetchCertificate(num: string) {
  const trimmed = (num || '').trim();
  if (!trimmed) {
    result.value = null;
    error.value = '';
    return;
  }

  loading.value = true;
  error.value = '';
  result.value = null;

  try {
    const res = await apiGet<VerifyResult>(`/public/certificates/verify/${encodeURIComponent(trimmed)}`);
    if (res && res.status === 'valid') {
      result.value = res;
    } else if (res && res.status === 'cancelled') {
      result.value = res;
      error.value = t('catalog.verify.cancelled', 'This certificate has been cancelled or revoked.');
    } else {
      result.value = null;
      error.value = t('catalog.verify.notFound', 'Certificate not found. Please check the Certificate ID and try again.');
    }
  } catch (e) {
    error.value = errorMessage(e, t('catalog.verify.failed', 'Certificate verification failed.'));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (inputNumber.value) {
    fetchCertificate(inputNumber.value);
  }
});

watch(() => route.params.number, (newNum) => {
  if (newNum && typeof newNum === 'string') {
    inputNumber.value = newNum;
    fetchCertificate(newNum);
  }
});

function handleSearch() {
  const code = inputNumber.value.trim();
  if (!code) return;
  router.push(`/certificates/${encodeURIComponent(code)}`);
  fetchCertificate(code);
}

const valid = computed(() => result.value?.status === 'valid');
const cetak = () => window.print();
</script>

<template>
  <div class="cert-verify-page min-h-screen py-8 px-4 sm:px-6">
    <div class="mx-auto max-w-6xl">
      <!-- ── SEARCH / INPUT BAR (Hidden in Print) ─────────────────────────── -->
      <div class="mb-8 rounded-2xl bg-white p-6 shadow-sm border border-slate-100 no-print">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 class="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-black">
                ✓
              </span>
              Online Certificate Verification
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 mt-1">
              Verify the authenticity of a National Fire Safety Institute (NFSI) / HSEdx certificate.
            </p>
          </div>

          <form @submit.prevent="handleSearch" class="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
            <input
              v-model="inputNumber"
              type="text"
              class="w-full sm:w-72 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition"
              placeholder="Enter Certificate Number..."
            />
            <button
              type="submit"
              :disabled="loading || !inputNumber.trim()"
              class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition disabled:opacity-50"
            >
              <span v-if="loading" class="animate-spin text-sm">⏳</span>
              <span>Verify</span>
            </button>
          </form>
        </div>
      </div>

      <!-- ── LOADING STATE ────────────────────────────────────────────────── -->
      <div v-if="loading" class="text-center py-16 no-print">
        <div class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
        <p class="mt-3 text-sm font-medium text-slate-500">{{ t('catalog.verify.verifying', 'Verifying certificate authenticity...') }}</p>
      </div>

      <!-- ── ERROR STATE (Hidden in Print) ─────────────────────────────────── -->
      <div v-else-if="error" class="mb-6 rounded-2xl bg-rose-50 border border-rose-200 p-6 text-center text-rose-800 no-print">
        <div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 font-bold text-xl mb-2">
          ✕
        </div>
        <h3 class="text-base font-bold">{{ error }}</h3>
        <p class="text-xs text-rose-600 mt-1">
          Please check the Certificate ID or scan the QR code printed on the physical certificate.
        </p>
      </div>

      <!-- ── VERIFIED RESULT DISPLAY ──────────────────────────────────────── -->
      <template v-else-if="result && valid">
        <!-- Verification Banner (Hidden in Print) -->
        <div class="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-6 py-4 text-emerald-900 shadow-sm no-print">
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-black text-lg shadow-sm">
              ✓
            </span>
            <div>
              <div class="font-bold text-base text-emerald-900">
                Official Verified Certificate
              </div>
              <div class="text-xs text-emerald-700 font-medium">
                Valid Certificate ID: <span class="font-mono font-bold">{{ result.certificate_number }}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              class="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition"
              @click="cetak"
            >
              🖶 Print / Download PDF
            </button>
          </div>
        </div>

        <!-- Certificate Document Component -->
        <CertificateDocument :cert="result" />
      </template>

      <!-- ── DEFAULT STATE WHEN NO NUMBER ENTERED (Hidden in Print) ────────── -->
      <div v-else-if="!inputNumber" class="text-center py-16 text-slate-400 no-print">
        <div class="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 text-3xl mb-3">
          📜
        </div>
        <p class="text-base font-semibold text-slate-600">Enter a Certificate Number above or scan a Certificate QR code</p>
        <p class="text-xs text-slate-400 mt-1">Verification is instant, tamper-proof, and publicly accessible.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }
  .cert-verify-page {
    padding: 0 !important;
    margin: 0 !important;
    background: #ffffff !important;
    min-height: auto !important;
  }
}
</style>
