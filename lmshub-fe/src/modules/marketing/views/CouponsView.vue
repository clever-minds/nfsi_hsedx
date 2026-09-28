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
 * Order memvalidasi masa berlaku, kuota dan minimum belanja. Yang tidak pernah
 * ada adalah sisi admin: tanpa layar ini kupon hanya bisa dibuat lewat SQL.
 */
interface Coupon extends Record<string, unknown> {
  id: string;
  kode: string;
  tipe_potongan: 'persen' | 'nominal';
  nilai_potongan: string;
  kuota_maksimal: number | null;
  kuota_terpakai: number;
  minimum_pembelian: string | null;
  berlaku_mulai: string | null;
  berlaku_sampai: string | null;
  is_aktif: boolean;
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
  tipe_potongan: 'persen' as 'persen' | 'nominal',
  nilai_potongan: 10,
  kuota_maksimal: '' as number | '',
  minimum_pembelian: '' as number | '',
  berlaku_mulai: '',
  berlaku_sampai: '',
  is_aktif: true,
});

const columns = computed(() => [
  { key: 'kode', label: t('coupons.colCode') },
  { key: 'nilai_potongan', label: t('coupons.colDiscount') },
  { key: 'kuota_terpakai', label: t('coupons.colUsage') },
  { key: 'berlaku_sampai', label: t('coupons.colWindow') },
  { key: 'is_aktif', label: t('coupons.colStatus') },
]);

/** `<input type="date">` memakai YYYY-MM-DD; API memakai ISO penuh. */
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (d: string, endOfDay = false) =>
  d ? new Date(`${d}T${endOfDay ? '23:59:59' : '00:00:00'}Z`).toISOString() : null;

function potonganLabel(c: Coupon): string {
  const n = Number(c.nilai_potongan);
  return c.tipe_potongan === 'persen' ? `${n}%` : `${currency.base} ${n}`;
}

function windowLabel(c: Coupon): string {
  const a = toDateInput(c.berlaku_mulai);
  const b = toDateInput(c.berlaku_sampai);
  if (!a && !b) return t('coupons.noLimit');
  if (a && b) return `${a} → ${b}`;
  return a ? `${t('coupons.from')} ${a}` : `${t('coupons.until')} ${b}`;
}

/** Kupon aktif yang jendelanya sudah lewat tetap ditolak checkout — tandai. */
function isExpired(c: Coupon): boolean {
  return !!c.berlaku_sampai && new Date(c.berlaku_sampai) < new Date();
}
function isExhausted(c: Coupon): boolean {
  return c.kuota_maksimal != null && c.kuota_terpakai >= c.kuota_maksimal;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, unknown> = { limit: 100, sort: 'created_at', order: 'desc' };
    if (q.value.trim()) params.q = q.value.trim();
    if (statusFilter.value) params['filter[is_aktif]'] = statusFilter.value;
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
    tipe_potongan: 'persen',
    nilai_potongan: 10,
    kuota_maksimal: '',
    minimum_pembelian: '',
    berlaku_mulai: '',
    berlaku_sampai: '',
    is_aktif: true,
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
    tipe_potongan: c.tipe_potongan,
    nilai_potongan: Number(c.nilai_potongan),
    kuota_maksimal: c.kuota_maksimal ?? '',
    minimum_pembelian: c.minimum_pembelian != null ? Number(c.minimum_pembelian) : '',
    berlaku_mulai: toDateInput(c.berlaku_mulai),
    berlaku_sampai: toDateInput(c.berlaku_sampai),
    is_aktif: c.is_aktif,
  });
  showForm.value = true;
}

async function submit() {
  if (!/^[A-Za-z0-9_-]{3,50}$/.test(form.kode.trim())) {
    formError.value = t('coupons.codeInvalid');
    return;
  }
  if (form.tipe_potongan === 'persen' && (form.nilai_potongan <= 0 || form.nilai_potongan > 100)) {
    formError.value = t('coupons.percentRange');
    return;
  }
  saving.value = true;
  formError.value = '';
  const payload = {
    kode: form.kode.trim(),
    tipe_potongan: form.tipe_potongan,
    nilai_potongan: Number(form.nilai_potongan),
    kuota_maksimal: form.kuota_maksimal === '' ? null : Number(form.kuota_maksimal),
    minimum_pembelian: form.minimum_pembelian === '' ? null : Number(form.minimum_pembelian),
    berlaku_mulai: fromDateInput(form.berlaku_mulai),
    berlaku_sampai: fromDateInput(form.berlaku_sampai, true),
    is_aktif: form.is_aktif,
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
    await apiPut(`/coupons/${c.id}`, { is_aktif: !c.is_aktif });
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
          <select v-model="form.tipe_potongan" class="input">
            <option value="persen">{{ t('coupons.typePercent') }}</option>
            <option value="nominal">{{ t('coupons.typeFixed', { currency: currency.base }) }}</option>
          </select>
        </div>
        <div>
          <label class="label">{{ t('coupons.value') }}</label>
          <input v-model.number="form.nilai_potongan" type="number" min="0" step="0.01" class="input" />
          <p class="mt-1 text-xs text-slate-400">
            {{ form.tipe_potongan === 'persen' ? t('coupons.valueHintPercent') : t('coupons.valueHintFixed') }}
          </p>
        </div>
        <div>
          <label class="label">{{ t('coupons.minPurchase') }}</label>
          <input v-model="form.minimum_pembelian" type="number" min="0" step="0.01" class="input" :placeholder="t('coupons.optional')" />
        </div>
        <div>
          <label class="label">{{ t('coupons.quota') }}</label>
          <input v-model="form.kuota_maksimal" type="number" min="1" class="input" :placeholder="t('coupons.quotaUnlimited')" />
        </div>
        <div class="flex items-end pb-1">
          <label class="label-inline">
            <input v-model="form.is_aktif" type="checkbox" /> {{ t('coupons.active') }}
          </label>
        </div>
        <div>
          <label class="label">{{ t('coupons.startDate') }}</label>
          <input v-model="form.berlaku_mulai" type="date" class="input" />
        </div>
        <div>
          <label class="label">{{ t('coupons.endDate') }}</label>
          <input v-model="form.berlaku_sampai" type="date" class="input" />
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
        <div v-if="(row as unknown as Coupon).minimum_pembelian" class="text-xs text-slate-400">
          {{ t('coupons.minPurchaseShort', { amount: `${currency.base} ${Number((row as unknown as Coupon).minimum_pembelian)}` }) }}
        </div>
      </template>

      <template #cell:nilai_potongan="{ row }">
        <span class="num">{{ potonganLabel(row as unknown as Coupon) }}</span>
      </template>

      <template #cell:kuota_terpakai="{ row }">
        <span class="num">
          {{ (row as unknown as Coupon).kuota_terpakai }}<template v-if="(row as unknown as Coupon).kuota_maksimal"> / {{ (row as unknown as Coupon).kuota_maksimal }}</template>
        </span>
        <div v-if="isExhausted(row as unknown as Coupon)" class="text-xs text-amber-600">{{ t('coupons.exhausted') }}</div>
      </template>

      <template #cell:berlaku_sampai="{ row }">
        <span class="text-xs text-slate-500">{{ windowLabel(row as unknown as Coupon) }}</span>
        <div v-if="isExpired(row as unknown as Coupon)" class="text-xs text-amber-600">{{ t('coupons.expired') }}</div>
      </template>

      <template #cell:is_aktif="{ value }">
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
            {{ (row as unknown as Coupon).is_aktif ? t('coupons.deactivate') : t('coupons.activate') }}
          </button>
          <button v-if="canUpdate" class="row-link" @click="openEdit(row as unknown as Coupon)">
            {{ t('common.action.edit') }}
          </button>
          <!-- Kupon yang sudah dipakai order ditolak backend: menghapusnya akan
               mengosongkan jejak diskon pada order lama. -->
          <button
            v-if="canDelete"
            class="row-link row-link-danger"
            :disabled="busyId === (row as unknown as Coupon).id || (row as unknown as Coupon).kuota_terpakai > 0"
            :title="(row as unknown as Coupon).kuota_terpakai > 0 ? t('coupons.usedHint') : ''"
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
