<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useCurrencyStore } from '@/stores/currency';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import Icon from '@/components/ui/Icon.vue';

/**
 * Kelola kode kupon.
 *
 * Penukarannya sudah lama jalan — checkout menerima `coupon_kode` dan modul
 * Order memvalidasi masa valid, kuota dan minimum belanja. Yang no pernah
 * ada adalah sisi admin: tanpa layar ini kupon hanya bisa created lewat SQL.
 */
interface Coupon extends Record<string, unknown> {
  id: string;
  kode: string;
  discount_type: 'persen' | 'amount';
  discount_value: string;
  max_quota: number | null;
  used_quota: number;
  min_purchase: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

const auth = useAuthStore();
const currency = useCurrencyStore();
const { t } = useI18n();
const canCreate = auth.can('marketing.create');
const canUpdate = auth.can('marketing.update');
const canDelete = auth.can('marketing.delete');

const rows = ref<Coupon[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

const q = ref('');
const statusFilter = ref<'' | 'true' | 'false'>('');

const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref('');

const form = reactive({
  kode: '',
  discount_type: 'persen' as 'persen' | 'amount',
  discount_value: 10,
  max_quota: '' as number | '',
  min_purchase: '' as number | '',
  valid_from: '',
  valid_until: '',
  is_active: true,
});

const columns = computed(() => [
  { key: 'kode', label: t('coupons.colCode') },
  { key: 'discount_value', label: t('coupons.colDiscount') },
  { key: 'used_quota', label: t('coupons.colUsage') },
  { key: 'valid_until', label: t('coupons.colWindow') },
  { key: 'is_active', label: t('coupons.colStatus') },
]);

/** `<input type="date">` memakai YYYY-MM-DD; API memakai ISO penuh. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (d: string, endOfDay = false) =>
  d ? new Date(`${d}T${endOfDay ? '23:59:59' : '00:00:00'}Z`).toISOString() : null;

function potonganLabel(c: Coupon): string {
  const n = Number(c.discount_value);
  return c.discount_type === 'persen' ? `${n}%` : `${currency.base} ${n}`;
}

function windowLabel(c: Coupon): string {
  const a = toDateInput(c.valid_from);
  const b = toDateInput(c.valid_until);
  if (!a && !b) return t('coupons.noLimit');
  if (a && b) return `${a} → ${b}`;
  return a ? `${t('coupons.from')} ${a}` : `${t('coupons.until')} ${b}`;
}

/** Kupon active yang jendelanya sudah lewat tetap ditolak checkout — tandai. */
function isExpired(c: Coupon): boolean {
  return !!c.valid_until && new Date(c.valid_until) < new Date();
}
function isExhausted(c: Coupon): boolean {
  return c.max_quota != null && c.used_quota >= c.max_quota;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, unknown> = { limit: 100, sort: 'created_at', order: 'desc' };
    if (q.value.trim()) params.q = q.value.trim();
    if (statusFilter.value) params['filter[is_active]'] = statusFilter.value;
    const res = await apiGetFull<Coupon[]>('/coupons', params);
    rows.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('coupons.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  formError.value = '';
  Object.assign(form, {
    kode: '',
    discount_type: 'persen',
    discount_value: 10,
    max_quota: '',
    min_purchase: '',
    valid_from: '',
    valid_until: '',
    is_active: true,
  });
}

function openCreate() {
  resetForm();
  showForm.value = true;
}

function openEdit(c: Coupon) {
  editingId.value = c.id;
  formError.value = '';
  Object.assign(form, {
    kode: c.kode,
    discount_type: c.discount_type,
    discount_value: Number(c.discount_value),
    max_quota: c.max_quota ?? '',
    min_purchase: c.min_purchase != null ? Number(c.min_purchase) : '',
    valid_from: toDateInput(c.valid_from),
    valid_until: toDateInput(c.valid_until),
    is_active: c.is_active,
  });
  showForm.value = true;
}

async function submit() {
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(form.kode.trim())) {
    formError.value = t('coupons.codeInvalid');
    return;
  }
  if (form.discount_type === 'persen' && (form.discount_value <= 0 || form.discount_value > 100)) {
    formError.value = t('coupons.percentRange');
    return;
  }
  saving.value = true;
  formError.value = '';
  const payload = {
    kode: form.kode.trim(),
    discount_type: form.discount_type,
    discount_value: Number(form.discount_value),
    max_quota: form.max_quota === '' ? null : Number(form.max_quota),
    min_purchase: form.min_purchase === '' ? null : Number(form.min_purchase),
    valid_from: fromDateInput(form.valid_from),
    valid_until: fromDateInput(form.valid_until, true),
    is_active: form.is_active,
  };
  try {
    if (editingId.value) await apiPut(`/coupons/${editingId.value}`, payload);
    else await apiPost('/coupons', payload);
    showForm.value = false;
    resetForm();
    await load();
  } catch (e) {
    formError.value = errorMessage(e, t('coupons.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function toggleAktif(c: Coupon) {
  busyId.value = c.id;
  error.value = '';
  try {
    await apiPut(`/coupons/${c.id}`, { is_active: !c.is_active });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('coupons.saveFailed'));
  } finally {
    busyId.value = null;
  }
}

async function remove(c: Coupon) {
  if (!window.confirm(t('coupons.confirmDelete', { code: c.kode }))) return;
  busyId.value = c.id;
  error.value = '';
  try {
    await apiDelete(`/coupons/${c.id}`);
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('coupons.deleteFailed'));
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('coupons.title')" :subtitle="t('coupons.subtitle')">
      <template #actions>
        <button v-if="canCreate" class="btn-primary" @click="openCreate">{{ t('coupons.add') }}</button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <div v-if="showForm" class="card mb-4 p-5">
      <h3 class="card-title">{{ editingId ? t('coupons.formEdit') : t('coupons.formNew') }}</h3>
      <div v-if="formError" class="mt-2 alert-error">{{ formError }}</div>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('coupons.colCode') }}</label>
          <input v-model="form.kode" class="input uppercase" placeholder="LATN20" />
          <p class="mt-1 text-xs text-slate-400">{{ t('coupons.codeHint') }}</p>
        </div>
        <div>
          <label class="label">{{ t('coupons.type') }}</label>
          <select v-model="form.discount_type" class="input">
            <option value="persen">{{ t('coupons.typePercent') }}</option>
            <option value="amount">{{ t('coupons.typeFixed', { currency: currency.base }) }}</option>
          </select>
        </div>
        <div>
          <label class="label">{{ t('coupons.value') }}</label>
          <input v-model.number="form.discount_value" type="number" min="0" step="0.01" class="input" />
          <p class="mt-1 text-xs text-slate-400">
            {{ form.discount_type === 'persen' ? t('coupons.valueHintPercent') : t('coupons.valueHintFixed') }}
          </p>
        </div>
        <div>
          <label class="label">{{ t('coupons.minPurchase') }}</label>
          <input v-model="form.min_purchase" type="number" min="0" step="0.01" class="input" :placeholder="t('coupons.optional')" />
        </div>
        <div>
          <label class="label">{{ t('coupons.quota') }}</label>
          <input v-model="form.max_quota" type="number" min="1" class="input" :placeholder="t('coupons.quotaUnlimited')" />
        </div>
        <div class="flex items-end pb-1">
          <label class="label-inline">
            <input v-model="form.is_active" type="checkbox" /> {{ t('coupons.active') }}
          </label>
        </div>
        <div>
          <label class="label">{{ t('coupons.startDate') }}</label>
          <input v-model="form.valid_from" type="date" class="input" />
        </div>
        <div>
          <label class="label">{{ t('coupons.endDate') }}</label>
          <input v-model="form.valid_until" type="date" class="input" />
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-outline" @click="showForm = false">{{ t('common.action.cancel') }}</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          {{ saving ? t('common.state.saving') : t('common.action.save') }}
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('coupons.empty')">
      <template #toolbar>
        <div>
          <label class="label">{{ t('common.action.search') }}</label>
          <input v-model="q" class="input" :placeholder="t('coupons.searchPlaceholder')" @keyup.enter="load" />
        </div>
        <div>
          <label class="label">{{ t('coupons.colStatus') }}</label>
          <select v-model="statusFilter" class="input" @change="load">
            <option value="">{{ t('coupons.filterAll') }}</option>
            <option value="true">{{ t('coupons.active') }}</option>
            <option value="false">{{ t('coupons.inactive') }}</option>
          </select>
        </div>
        <button class="btn-outline" @click="load">{{ t('common.action.apply') }}</button>
      </template>

      <template #cell:kode="{ row }">
        <span class="font-mono font-medium text-slate-800">{{ (row as unknown as Coupon).kode }}</span>
        <div v-if="(row as unknown as Coupon).min_purchase" class="text-xs text-slate-400">
          {{ t('coupons.minPurchaseShort', { amount: `${currency.base} ${Number((row as unknown as Coupon).min_purchase)}` }) }}
        </div>
      </template>

      <template #cell:discount_value="{ row }">
        <span class="num">{{ potonganLabel(row as unknown as Coupon) }}</span>
      </template>

      <template #cell:used_quota="{ row }">
        <span class="num">
          {{ (row as unknown as Coupon).used_quota }}<template v-if="(row as unknown as Coupon).max_quota"> / {{ (row as unknown as Coupon).max_quota }}</template>
        </span>
        <div v-if="isExhausted(row as unknown as Coupon)" class="text-xs text-amber-600">{{ t('coupons.exhausted') }}</div>
      </template>

      <template #cell:valid_until="{ row }">
        <span class="text-xs text-slate-500">{{ windowLabel(row as unknown as Coupon) }}</span>
        <div v-if="isExpired(row as unknown as Coupon)" class="text-xs text-amber-600">{{ t('coupons.expired') }}</div>
      </template>

      <template #cell:is_active="{ value }">
        <span
          class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
        >
          {{ value ? t('coupons.active') : t('coupons.inactive') }}
        </span>
      </template>

      <template #actions="{ row }">
        <div class="flex flex-wrap justify-end gap-2">
          <button
            v-if="canUpdate"
            class="row-link"
            :disabled="busyId === (row as unknown as Coupon).id"
            @click="toggleAktif(row as unknown as Coupon)"
          >
            {{ (row as unknown as Coupon).is_active ? t('coupons.deactivate') : t('coupons.activate') }}
          </button>
          <button v-if="canUpdate" class="row-link" @click="openEdit(row as unknown as Coupon)">
            {{ t('common.action.edit') }}
          </button>
          <!-- Kupon yang sudah dipakai order ditolak backend: menghapusnya akan
               mengosongkan jejak discount pada order lama. -->
          <button
            v-if="canDelete"
            class="row-link row-link-danger"
            :disabled="busyId === (row as unknown as Coupon).id || (row as unknown as Coupon).used_quota > 0"
            :title="(row as unknown as Coupon).used_quota > 0 ? t('coupons.usedHint') : ''"
            @click="remove(row as unknown as Coupon)"
          >
            {{ t('common.action.delete') }}
          </button>
        </div>
      </template>
    </DataTable>

    <p class="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
      <Icon name="alert-circle" :size="14" class="mt-0.5 shrink-0" />
      {{ t('coupons.hint') }}
    </p>
  </div>
</template>
