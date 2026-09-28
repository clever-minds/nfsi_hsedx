<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, errorMessage } from '@/lib/api';
import { fmtTanggal } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';

type AuditRow = Record<string, unknown> & {
  id: string;
  waktu?: string;
  user_nama?: string;
  module?: string;
  aksi?: string;
  nilai_lama?: Record<string, unknown> | null;
  nilai_baru?: Record<string, unknown> | null;
  alasan?: string;
};

const { t } = useI18n();

const columns = computed(() => [
  { key: 'waktu', label: t('audit.colTime') },
  { key: 'user_nama', label: t('audit.colUser') },
  { key: 'module', label: t('audit.colModule') },
  { key: 'aksi', label: t('audit.colAction') },
]);

const rows = ref<AuditRow[]>([]);
const loading = ref(true);
const error = ref('');
const expandedId = ref<string | null>(null);

const filters = reactive({ module: '', dari: '', sampai: '' });
const page = ref(1);
const limit = 25;
const total = ref(0);

async function fetchAuditLog(params: Record<string, unknown>) {
  // BE: documents module mount di root -> GET /audit (bukan /documents/audit)
  return apiGetFull<AuditRow[]>('/audit', params);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE membaca query dengan key filter[module]/filter[dari]/filter[sampai]
    const res = await fetchAuditLog({
      'filter[module]': filters.module || undefined,
      'filter[dari]': filters.dari || undefined,
      'filter[sampai]': filters.sampai || undefined,
      page: page.value,
      limit,
    });
    rows.value = res.data ?? [];
    total.value = Number((res.meta as Record<string, unknown> | null)?.total ?? rows.value.length);
  } catch (e) {
    error.value = errorMessage(e, t('audit.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function toggle(row: AuditRow) {
  expandedId.value = expandedId.value === row.id ? null : row.id;
}

function entries(obj?: Record<string, unknown> | null): Array<[string, unknown]> {
  return obj ? Object.entries(obj) : [];
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('audit.title')" :subtitle="t('audit.subtitle')" />

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('audit.empty')">
      <template #toolbar>
        <div>
          <label class="label">{{ t('audit.module') }}</label>
          <input v-model="filters.module" class="input w-40" :placeholder="t('audit.modulePlaceholder')" @keyup.enter="search" />
        </div>
        <div>
          <label class="label">{{ t('audit.fromDate') }}</label>
          <input v-model="filters.dari" type="date" class="input w-auto" @change="search" />
        </div>
        <div>
          <label class="label">{{ t('audit.toDate') }}</label>
          <input v-model="filters.sampai" type="date" class="input w-auto" @change="search" />
        </div>
        <button class="btn-outline" @click="search">{{ t('audit.applyFilter') }}</button>
      </template>
      <template #cell:waktu="{ value }">{{ value ? fmtTanggal(String(value)) : '—' }}</template>
      <template #cell:module="{ value }"><span class="capitalize">{{ value || '—' }}</span></template>
      <template #actions="{ row }">
        <button class="btn-outline btn-sm" @click="toggle(row as AuditRow)">
          {{ expandedId === (row as AuditRow).id ? t('audit.hide') : t('audit.detail') }}
        </button>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
      </template>
    </DataTable>

    <div
      v-for="row in rows.filter((r) => r.id === expandedId)"
      :key="`detail-${row.id}`"
      class="card mt-3 p-4 text-sm"
    >
      <p v-if="row.alasan" class="mb-2 text-slate-600">{{ t('audit.reason', { value: row.alasan }) }}</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 class="mb-1 text-xs font-semibold uppercase text-slate-400">{{ t('audit.oldValue') }}</h4>
          <div v-if="!entries(row.nilai_lama).length" class="text-slate-400">—</div>
          <div v-for="[k, v] in entries(row.nilai_lama)" :key="k" class="flex justify-between border-b border-slate-100 py-1">
            <span class="text-slate-500">{{ k }}</span><span>{{ v }}</span>
          </div>
        </div>
        <div>
          <h4 class="mb-1 text-xs font-semibold uppercase text-slate-400">{{ t('audit.newValue') }}</h4>
          <div v-if="!entries(row.nilai_baru).length" class="text-slate-400">—</div>
          <div v-for="[k, v] in entries(row.nilai_baru)" :key="k" class="flex justify-between border-b border-slate-100 py-1">
            <span class="text-slate-500">{{ k }}</span><span>{{ v }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
