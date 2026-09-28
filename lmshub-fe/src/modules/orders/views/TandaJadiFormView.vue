<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPost, errorMessage, http } from '@/lib/api';
import { fmtHarga } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';

interface CourseOption {
  id: string;
  judul: string;
  harga: number;
}

const route = useRoute();
const auth = useAuthStore();
const { t } = useI18n();

const courses = ref<CourseOption[]>([]);
const loadingCourses = ref(true);
const loading = ref(false);
const error = ref('');
const success = ref(false);

const form = reactive({
  pembeli_nama: '',
  pembeli_kontak: '',
  kursus_id: '',
  nominal: 0 as number | null,
  metode: 'transfer_bank',
  catatan: '',
  lead_id: (route.query.lead_id as string) || '',
});
const bukti = ref<File | null>(null);

function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  bukti.value = input.files?.[0] ?? null;
}

async function loadCourses() {
  loadingCourses.value = true;
  try {
    const res = await apiGetFull<CourseOption[]>('/courses/public', { limit: 100 });
    courses.value = res.data ?? [];
  } catch {
    courses.value = [];
  } finally {
    loadingCourses.value = false;
  }
}

async function prefillFromLead() {
  if (!form.lead_id) return;
  try {
    const lead = await apiGet<Record<string, unknown>>(`/marketing/leads/${form.lead_id}`);
    form.pembeli_nama = String(lead.nama ?? lead.pembeli_nama ?? '');
    form.pembeli_kontak = String(lead.kontak ?? '');
    if (lead.nilai_estimasi) form.nominal = Number(lead.nilai_estimasi);
    if (lead.catatan) form.catatan = String(lead.catatan);
  } catch {
    /* prefill best-effort saja */
  }
}

async function submit() {
  error.value = '';
  success.value = false;
  if (!form.pembeli_nama || !form.kursus_id || !form.nominal || form.nominal <= 0) {
    error.value = t('orders.manual.incomplete');
    return;
  }
  loading.value = true;
  try {
    if (bukti.value) {
      const fd = new FormData();
      fd.append('pembeli_nama', form.pembeli_nama);
      fd.append('pembeli_kontak', form.pembeli_kontak);
      fd.append('kursus_id', form.kursus_id);
      fd.append('nominal', String(form.nominal));
      fd.append('metode', form.metode);
      fd.append('catatan', form.catatan);
      if (form.lead_id) fd.append('lead_id', form.lead_id);
      fd.append('bukti', bukti.value);
      await http.post('/orders/manual', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    } else {
      await apiPost('/orders/manual', { ...form, marketing_user_id: auth.user?.id });
    }
    success.value = true;
  } catch (e) {
    error.value = errorMessage(e, t('orders.manual.saveFailed'));
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  success.value = false;
  form.pembeli_nama = '';
  form.pembeli_kontak = '';
  form.kursus_id = '';
  form.nominal = 0;
  form.catatan = '';
  bukti.value = null;
}

onMounted(async () => {
  await Promise.all([loadCourses(), prefillFromLead()]);
});
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader :title="t('orders.manual.title')" :subtitle="t('orders.manual.subtitle')" />

    <div v-if="success" class="card space-y-4 p-6">
      <div class="alert-success">{{ t('orders.manual.success') }}</div>
      <div class="flex gap-2">
        <RouterLink class="btn-primary" :to="{ name: 'transaksi' }">{{ t('orders.manual.viewList') }}</RouterLink>
        <button class="btn-outline" @click="resetForm">{{ t('orders.manual.again') }}</button>
      </div>
    </div>

    <form v-else class="card space-y-4 p-6" @submit.prevent="submit">
      <div v-if="error" class="alert-error">{{ error }}</div>

      <div>
        <label class="label">{{ t('orders.manual.buyer') }}</label>
        <input v-model="form.pembeli_nama" class="input" :placeholder="t('orders.manual.buyerPlaceholder')" required />
      </div>
      <div>
        <label class="label">{{ t('orders.manual.contact') }}</label>
        <input v-model="form.pembeli_kontak" class="input" :placeholder="t('orders.manual.contactPlaceholder')" />
      </div>
      <div>
        <label class="label">{{ t('orders.manual.course') }}</label>
        <select v-model="form.kursus_id" class="input" required>
          <option value="" disabled>
            {{ loadingCourses ? t('orders.manual.loadingCourses') : t('orders.manual.pickCourse') }}
          </option>
          <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.judul }} — {{ fmtHarga(c.harga) }}</option>
        </select>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('orders.manual.amount') }}</label>
          <input v-model.number="form.nominal" type="number" min="0" step="1000" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('orders.manual.method') }}</label>
          <select v-model="form.metode" class="input">
            <option value="transfer_bank">{{ t('orders.manual.methodTransfer') }}</option>
            <option value="tunai">{{ t('orders.manual.methodCash') }}</option>
            <option value="kartu">{{ t('orders.manual.methodCard') }}</option>
            <option value="lainnya">{{ t('orders.manual.methodOther') }}</option>
          </select>
        </div>
      </div>
      <div>
        <label class="label">{{ t('orders.manual.marketing') }}</label>
        <input class="input bg-slate-50" :value="auth.user?.nama_lengkap ?? '—'" disabled />
        <p class="mt-1 text-xs text-slate-400">{{ t('orders.manual.marketingHint') }}</p>
      </div>
      <div>
        <label class="label">{{ t('orders.manual.proof') }}</label>
        <input type="file" class="input" accept=".pdf,.jpg,.jpeg,.png" @change="onFile" />
      </div>
      <div>
        <label class="label">{{ t('orders.manual.notes') }}</label>
        <textarea v-model="form.catatan" class="input" rows="3" :placeholder="t('orders.manual.notesPlaceholder')" />
      </div>

      <button class="btn-primary w-full" :disabled="loading">
        {{ loading ? t('common.state.saving') : t('orders.manual.submit') }}
      </button>
      <p class="text-center text-xs text-slate-400">{{ t('orders.manual.footerHint') }}</p>
    </form>
  </div>
</template>
