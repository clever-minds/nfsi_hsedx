<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import Icon from '@/components/ui/Icon.vue';

/**
 * Master data account tujuan transfer manual. previous tiga baris di
 * settings yang hanya muat satu account; sekarang berdiri sendiri supaya
 * lembaga bisa punya beberapa account dan menandai salah satunya sebagai primary.
 */
interface BankAccount extends Record<string, unknown> {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  branch: string | null;
  notes: string | null;
  is_active: boolean;
  is_primary: boolean;
  sort_order: number;
}

const auth = useAuthStore();
const { t } = useI18n();
const canEdit = auth.can('settings.update');

const rows = ref<BankAccount[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref('');

const form = reactive({
  bank_name: '',
  account_number: '',
  account_name: '',
  branch: '',
  notes: '',
  is_active: true,
  is_primary: false,
  sort_order: 0,
});

const columns = computed(() => [
  { key: 'bank_name', label: t('bankAccounts.colBank') },
  { key: 'account_number', label: t('bankAccounts.colNumber') },
  { key: 'account_name', label: t('bankAccounts.colHolder') },
  { key: 'is_active', label: t('bankAccounts.colStatus') },
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
    bank_name: '',
    account_number: '',
    account_name: '',
    branch: '',
    notes: '',
    is_active: true,
    is_primary: false,
    sort_order: 0,
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
    bank_name: row.bank_name,
    account_number: row.account_number,
    account_name: row.account_name,
    branch: row.branch ?? '',
    notes: row.notes ?? '',
    is_active: row.is_active,
    is_primary: row.is_primary,
    sort_order: row.sort_order,
  });
  showForm.value = true;
}

async function submit() {
  if (!form.bank_name.trim() || !form.account_number.trim() || !form.account_name.trim()) {
    formError.value = t('bankAccounts.required');
    return;
  }
  saving.value = true;
  formError.value = '';
  const payload = {
    bank_name: form.bank_name.trim(),
    account_number: form.account_number.trim(),
    account_name: form.account_name.trim(),
    branch: form.branch.trim() || null,
    notes: form.notes.trim() || null,
    is_active: form.is_active,
    is_primary: form.is_primary,
    sort_order: Number(form.sort_order) || 0,
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

/** Jadikan account primary — backend melepas tanda primary from account lain. */
async function makePrimary(row: BankAccount) {
  busyId.value = row.id;
  error.value = '';
  try {
    await apiPut(`/bank-accounts/${row.id}`, { is_primary: true });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('bankAccounts.saveFailed'));
  } finally {
    busyId.value = null;
  }
}

async function remove(row: BankAccount) {
  if (!window.confirm(t('bankAccounts.confirmDelete', { bank: row.bank_name, number: row.account_number }))) return;
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
        <RouterLink class="btn-outline" :to="{ name: 'settings' }">{{ t('bankAccounts.back') }}</RouterLink>
        <button v-if="canEdit" class="btn-primary" @click="openCreate">{{ t('bankAccounts.add') }}</button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <!-- Formulir add/edit -->
    <div v-if="showForm" class="card mb-4 p-5">
      <h3 class="card-title">
        {{ editingId ? t('bankAccounts.formTitleEdit') : t('bankAccounts.formTitleNew') }}
      </h3>
      <div v-if="formError" class="mt-2 alert-error">{{ formError }}</div>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('bankAccounts.colBank') }}</label>
          <input v-model="form.bank_name" class="input" :placeholder="t('bankAccounts.bankPlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.colNumber') }}</label>
          <input v-model="form.account_number" class="input num" inputmode="numeric" placeholder="1234567890" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.colHolder') }}</label>
          <input v-model="form.account_name" class="input" :placeholder="t('bankAccounts.holderPlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.branch') }}</label>
          <input v-model="form.branch" class="input" :placeholder="t('bankAccounts.branchPlaceholder')" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">{{ t('bankAccounts.note') }}</label>
          <input v-model="form.notes" class="input" :placeholder="t('bankAccounts.notePlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('bankAccounts.order') }}</label>
          <input v-model.number="form.sort_order" type="number" min="0" class="input" />
        </div>
        <div class="flex flex-col justify-end gap-2 pb-1">
          <label class="label-inline">
            <input v-model="form.is_active" type="checkbox" /> {{ t('bankAccounts.active') }}
          </label>
          <label class="label-inline">
            <input v-model="form.is_primary" type="checkbox" /> {{ t('bankAccounts.primary') }}
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
      <template #cell:bank_name="{ row }">
        <div class="flex items-center gap-2">
          <span class="font-medium text-slate-800">{{ (row as unknown as BankAccount).bank_name }}</span>
          <span
            v-if="(row as unknown as BankAccount).is_primary"
            class="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600"
          >
            {{ t('bankAccounts.primaryBadge') }}
          </span>
        </div>
        <div v-if="(row as unknown as BankAccount).branch" class="text-xs text-slate-400">
          {{ (row as unknown as BankAccount).branch }}
        </div>
      </template>

      <template #cell:account_number="{ value }">
        <span class="num">{{ value }}</span>
      </template>

      <template #cell:is_active="{ value }">
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
            v-if="!(row as unknown as BankAccount).is_primary && (row as unknown as BankAccount).is_active"
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
