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
  title: string;
  price: number;
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
  pembeli_name: '',
  pembeli_kontak: '',
  course_id: '',
  amount: 0 as number | null,
  method: 'transfer_bank',
  notes: '',
  lead_id: (route.query.lead_id as string) || '',
});
const proof = ref<File | null>(null);

function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  proof.value = input.files?.[0] ?? null;
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
    form.pembeli_name = String(lead.name ?? lead.pembeli_name ?? '');
    form.pembeli_kontak = String(lead.kontak ?? '');
    if (lead.value_estimasi) form.amount = Number(lead.value_estimasi);
    if (lead.notes) form.notes = String(lead.notes);
  } catch {
    /* prefill best-effort saja */
  }
}

async function submit() {
  error.value = '';
  success.value = false;
  if (!form.pembeli_name || !form.course_id || !form.amount || form.amount <= 0) {
    error.value = t('orders.manual.incomplete');
    return;
  }
  loading.value = true;
  try {
    if (proof.value) {
      const fd = new FormData();
      fd.append('pembeli_name', form.pembeli_name);
      fd.append('pembeli_kontak', form.pembeli_kontak);
      fd.append('course_id', form.course_id);
      fd.append('amount', String(form.amount));
      fd.append('method', form.method);
      fd.append('notes', form.notes);
      if (form.lead_id) fd.append('lead_id', form.lead_id);
      fd.append('proof', proof.value);
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
  form.pembeli_name = '';
  form.pembeli_kontak = '';
  form.course_id = '';
  form.amount = 0;
  form.notes = '';
  proof.value = null;
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
        <RouterLink class="btn-primary" :to="{ name: 'transactions' }">{{ t('orders.manual.viewList') }}</RouterLink>
        <button class="btn-outline" @click="resetForm">{{ t('orders.manual.again') }}</button>
      </div>
    </div>

    <form v-else class="card space-y-4 p-6" @submit.prevent="submit">
      <div v-if="error" class="alert-error">{{ error }}</div>

      <div>
        <label class="label">{{ t('orders.manual.buyer') }}</label>
        <input v-model="form.pembeli_name" class="input" :placeholder="t('orders.manual.buyerPlaceholder')" required />
      </div>
      <div>
        <label class="label">{{ t('orders.manual.contact') }}</label>
        <input v-model="form.pembeli_kontak" class="input" :placeholder="t('orders.manual.contactPlaceholder')" />
      </div>
      <div>
        <label class="label">{{ t('orders.manual.course') }}</label>
        <select v-model="form.course_id" class="input" required>
          <option value="" disabled>
            {{ loadingCourses ? t('orders.manual.loadingCourses') : t('orders.manual.pickCourse') }}
          </option>
          <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }} — {{ fmtHarga(c.price) }}</option>
        </select>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('orders.manual.amount') }}</label>
          <input v-model.number="form.amount" type="number" min="0" step="1000" class="input" required />
        </div>
        <div>
          <label class="label">{{ t('orders.manual.method') }}</label>
          <select v-model="form.method" class="input">
            <option value="transfer_bank">{{ t('orders.manual.methodTransfer') }}</option>
            <option value="tunai">{{ t('orders.manual.methodCash') }}</option>
            <option value="kartu">{{ t('orders.manual.methodCard') }}</option>
            <option value="lainnya">{{ t('orders.manual.methodOther') }}</option>
          </select>
        </div>
      </div>
      <div>
        <label class="label">{{ t('orders.manual.marketing') }}</label>
        <input class="input bg-slate-50" :value="auth.user?.name_lengkap ?? '—'" disabled />
        <p class="mt-1 text-xs text-slate-400">{{ t('orders.manual.marketingHint') }}</p>
      </div>
      <div>
        <label class="label">{{ t('orders.manual.proof') }}</label>
        <input type="file" class="input" accept=".pdf,.jpg,.jpeg,.png" @change="onFile" />
      </div>
      <div>
        <label class="label">{{ t('orders.manual.notes') }}</label>
        <textarea v-model="form.notes" class="input" rows="3" :placeholder="t('orders.manual.notesPlaceholder')" />
      </div>

      <button class="btn-primary w-full" :disabled="loading">
        {{ loading ? t('common.state.saving') : t('orders.manual.submit') }}
      </button>
      <p class="text-center text-xs text-slate-400">{{ t('orders.manual.footerHint') }}</p>
    </form>
  </div>
</template>
