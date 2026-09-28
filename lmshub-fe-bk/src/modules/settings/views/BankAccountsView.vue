<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import Icon from '@/components/ui/Icon.vue';

/**
 * Master data rekening tujuan transfer manual. Sebelumnya tiga baris di
 * Pengaturan yang hanya muat satu rekening; sekarang berdiri sendiri supaya
 * lembaga bisa punya beberapa rekening dan menandai salah satunya sebagai utama.
 */
interface BankAccount extends Record<string, unknown> {
  id: string;
  nama_bank: string;
  nomor_rekening: string;
  atas_nama: string;
  cabang: string | null;
  catatan: string | null;
  is_aktif: boolean;
  is_utama: boolean;
  urutan: number;
}

const auth = useAuthStore();
const { t } = useI18n();
const canEdit = auth.can('pengaturan.update');

const rows = ref<BankAccount[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref('');

const form = reactive({
  nama_bank: '',
  nomor_rekening: '',
  atas_nama: '',
  cabang: '',
  catatan: '',
  is_aktif: true,
  is_utama: false,
  urutan: 0,
});

const columns = computed(() => [
  { key: 'nama_bank', label: t('bankAccounts.colBank') },
  { key: 'nomor_rekening', label: t('bankAccounts.colNumber') },
  { key: 'atas_nama', label: t('bankAccounts.colHolder') },
  { key: 'is_aktif', label: t('bankAccounts.colStatus') },
]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<BankAccount[]>('/bank-accounts', { limit: 100 });
    rows.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('bankAccounts.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  formError.value = '';
  Object.assign(form, {
    nama_bank: '',
    nomor_rekening: '',
    atas_nama: '',
    cabang: '',
    catatan: '',
    is_aktif: true,
    is_utama: false,
    urutan: 0,
  });
}

function openCreate() {
  resetForm();
  showForm.value = true;
}

function openEdit(row: BankAccount) {
  editingId.value = row.id;
  formError.value = '';
  Object.assign(form, {
    nama_bank: row.nama_bank,
    nomor_rekening: row.nomor_rekening,
    atas_nama: row.atas_nama,
    cabang: row.cabang ?? '',
    catatan: row.catatan ?? '',
    is_aktif: row.is_aktif,
    is_utama: row.is_utama,
    urutan: row.urutan,
  });
  showForm.value = true;
}

async function submit() {
  if (!form.nama_bank.trim() || !form.nomor_rekening.trim() || !form.atas_nama.trim()) {
    formError.value = t('bankAccounts.required');
    return;
  }
  saving.value = true;
  formError.value = '';
  const payload = {
    nama_bank: form.nama_bank.trim(),
    nomor_rekening: form.nomor_rekening.trim(),
    atas_nama: form.atas_nama.trim(),
    cabang: form.cabang.trim() || null,
    catatan: form.catatan.trim() || null,
    is_aktif: form.is_aktif,
    is_utama: form.is_utama,
    urutan: Number(form.urutan) || 0,
  };
  try {
    if (editingId.value) await apiPut(`/bank-accounts/${editingId.value}`, payload);
    else await apiPost('/bank-accounts', payload);
    showForm.value = false;
    resetForm();
    await load();
  } catch (e) {
    formError.value = errorMessage(e, t('bankAccounts.saveFailed'));
  } finally {
    saving.value = false;
  }
}

/** Jadikan rekening utama — backend melepas tanda utama dari rekening lain. */
async function makePrimary(row: BankAccount) {
  busyId.value = row.id;
  error.value = '';
  try {
    await apiPut(`/bank-accounts/${row.id}`, { is_utama: true });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('bankAccounts.saveFailed'));
  } finally {
    busyId.value = null;
  }
}

async function remove(row: BankAccount) {
  if (!window.confirm(t('bankAccounts.confirmDelete', { bank: row.nama_bank, number: row.nomor_rekening }))) return;
  busyId.value = row.id;
  error.value = '';
  try {
    await apiDelete(`/bank-accounts/${row.id}`);
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('bankAccounts.deleteFailed'));
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('bankAccounts.title')" :subtitle="t('bankAccounts.subtitle')">
      <template #actions>
        <RouterLink class="btn-outline" :to="{ name: 'pengaturan' }">{{ t('bankAccounts.back') }}</RouterLink>
        <button v-if="canEdit" class="btn-primary" @click="openCreate">{{ t('bankAccounts.add') }}</button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <!-- Formulir tambah/ubah -->
    <div v-if="showForm" class="card mb-4 p-5">
      <h3 class="card-title">
        {{ editingId ? t('bankAccounts.formTitleEdit') : t('bankAccounts.formTitleNew') }}
      </h3>
      <div v-if="formError" class="mt-2 alert-error">{{ formError }}</div>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('bankAccounts.colBank') }}</label>
          <input v-model="form.nama_bank" class="input" :placeholder="t('bankAccounts.bankPlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.colNumber') }}</label>
          <input v-model="form.nomor_rekening" class="input num" inputmode="numeric" placeholder="1234567890" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.colHolder') }}</label>
          <input v-model="form.atas_nama" class="input" :placeholder="t('bankAccounts.holderPlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.branch') }}</label>
          <input v-model="form.cabang" class="input" :placeholder="t('bankAccounts.branchPlaceholder')" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">{{ t('bankAccounts.note') }}</label>
          <input v-model="form.catatan" class="input" :placeholder="t('bankAccounts.notePlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.order') }}</label>
          <input v-model.number="form.urutan" type="number" min="0" class="input" />
        </div>
        <div class="flex flex-col justify-end gap-2 pb-1">
          <label class="label-inline">
            <input v-model="form.is_aktif" type="checkbox" /> {{ t('bankAccounts.active') }}
          </label>
          <label class="label-inline">
            <input v-model="form.is_utama" type="checkbox" /> {{ t('bankAccounts.primary') }}
          </label>
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-outline" @click="showForm = false">{{ t('common.action.cancel') }}</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          {{ saving ? t('common.state.saving') : t('common.action.save') }}
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('bankAccounts.empty')">
      <template #cell:nama_bank="{ row }">
        <div class="flex items-center gap-2">
          <span class="font-medium text-slate-800">{{ (row as unknown as BankAccount).nama_bank }}</span>
          <span
            v-if="(row as unknown as BankAccount).is_utama"
            class="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600"
          >
            {{ t('bankAccounts.primaryBadge') }}
          </span>
        </div>
        <div v-if="(row as unknown as BankAccount).cabang" class="text-xs text-slate-400">
          {{ (row as unknown as BankAccount).cabang }}
        </div>
      </template>

      <template #cell:nomor_rekening="{ value }">
        <span class="num">{{ value }}</span>
      </template>

      <template #cell:is_aktif="{ value }">
        <span
          class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
        >
          {{ value ? t('bankAccounts.active') : t('bankAccounts.inactive') }}
        </span>
      </template>

      <template #actions="{ row }">
        <div v-if="canEdit" class="flex flex-wrap justify-end gap-2">
          <button
            v-if="!(row as unknown as BankAccount).is_utama && (row as unknown as BankAccount).is_aktif"
            class="row-link row-link-primary"
            :disabled="busyId === (row as unknown as BankAccount).id"
            @click="makePrimary(row as unknown as BankAccount)"
          >
            {{ t('bankAccounts.makePrimary') }}
          </button>
          <button
            class="row-link"
            @click="openEdit(row as unknown as BankAccount)"
          >
            {{ t('common.action.edit') }}
          </button>
          <button
            class="row-link row-link-danger"
            :disabled="busyId === (row as unknown as BankAccount).id"
            @click="remove(row as unknown as BankAccount)"
          >
            {{ t('common.action.delete') }}
          </button>
        </div>
      </template>
    </DataTable>

    <p class="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
      <Icon name="alert-circle" :size="14" class="mt-0.5 shrink-0" />
      {{ t('bankAccounts.primaryHint') }}
    </p>
  </div>
</template>
