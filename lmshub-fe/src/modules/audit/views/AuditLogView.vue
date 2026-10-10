<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, errorMessage } from '@/lib/api';
import { fmtTanggal } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import { moduleLabel } from '@/lib/labels';
import enCommon from '@/i18n/messages/en/common.json';

type AuditRow = Record<string, unknown> & {
  id: string;
  time?: string;
  user_name?: string;
  module?: string;
  action?: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  reason?: string;
};

const { t } = useI18n();

const columns = computed(() => [
  { key: 'time', label: t('audit.colTime') },
  { key: 'user_name', label: t('audit.colUser') },
  { key: 'module', label: t('audit.colModule') },
  { key: 'action', label: t('audit.colAction') },
]);

const rows = ref<AuditRow[]>([]);
const loading = ref(true);
const error = ref('');
const expandedId = ref<string | null>(null);

const filters = reactive({ module: '', from: '', until: '' });

/** Every RBAC module code, sorted by its label in the current language. */
const moduleOptions = computed(() =>
  Object.keys(enCommon.module).sort((x, y) => moduleLabel(x).localeCompare(moduleLabel(y))),
);
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
    // BE membaca query dengan key filter[module]/filter[from]/filter[until]
    const res = await fetchAuditLog({
      'filter[module]': filters.module || undefined,
      'filter[from]': filters.from || undefined,
      'filter[until]': filters.until || undefined,
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
          <!-- A list, not free text: the filter matches stored module codes
               (`transaction`), which a person reading English labels cannot guess. -->
          <select v-model="filters.module" class="input w-auto" @change="search">
            <option value="">{{ t('audit.allModules') }}</option>
            <option v-for="m in moduleOptions" :key="m" :value="m">{{ moduleLabel(m) }}</option>
          </select>
        </div>
        <div>
          <label class="label">{{ t('audit.fromDate') }}</label>
          <input v-model="filters.from" type="date" class="input w-auto" @change="search" />
        </div>
        <div>
          <label class="label">{{ t('audit.toDate') }}</label>
          <input v-model="filters.until" type="date" class="input w-auto" @change="search" />
        </div>
        <button class="btn-outline" @click="search">{{ t('audit.applyFilter') }}</button>
      </template>
      <template #cell:time="{ value }">{{ value ? fmtTanggal(String(value)) : '—' }}</template>
      <template #cell:module="{ value }">{{ value ? moduleLabel(String(value)) : '—' }}</template>
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
      <p v-if="row.reason" class="mb-2 text-slate-600">{{ t('audit.reason', { value: row.reason }) }}</p>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 class="mb-1 text-xs font-semibold uppercase text-slate-400">{{ t('audit.oldValue') }}</h4>
          <div v-if="!entries(row.old_value).length" class="text-slate-400">—</div>
          <div v-for="[k, v] in entries(row.old_value)" :key="k" class="flex justify-between border-b border-slate-100 py-1">
            <span class="text-slate-500">{{ k }}</span><span>{{ v }}</span>
          </div>
        </div>
        <div>
          <h4 class="mb-1 text-xs font-semibold uppercase text-slate-400">{{ t('audit.newValue') }}</h4>
          <div v-if="!entries(row.new_value).length" class="text-slate-400">—</div>
          <div v-for="[k, v] in entries(row.new_value)" :key="k" class="flex justify-between border-b border-slate-100 py-1">
            <span class="text-slate-500">{{ k }}</span><span>{{ v }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
