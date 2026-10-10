<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, errorMessage } from '@/lib/api';
import { fmtNamaBulan, fmtRp, fmtTanggalSaja } from '@/lib/format';
import KpiCard from '@/components/ui/KpiCard.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';

interface FinancialSummary {
  pemasukan: number;
  pengeluaran: number;
  arus_kas?: number;
  laba?: number;
}
type EntryRow = Record<string, unknown> & {
  id: string;
  date?: string;
  type: string; // pemasukan | pengeluaran
  /** BE mengirim `category_name` (alias from expense_category.name), bukan `category`. */
  category_name?: string;
  description?: string;
  amount: number;
};

const { t } = useI18n();

const now = new Date();
const filters = reactive({ month: now.getMonth() + 1, year: now.getFullYear() });

const summary = ref<FinancialSummary>({ pemasukan: 0, pengeluaran: 0 });
const entries = ref<EntryRow[]>([]);
const loading = ref(true);
const page = ref(1);
const limit = 20;
const total = ref(0);
const error = ref('');

const columns = computed(() => [
  { key: 'date', label: t('reports.financial.colDate') },
  { key: 'type', label: t('reports.financial.colType') },
  { key: 'category_name', label: t('reports.financial.colCategory') },
  { key: 'description', label: t('reports.financial.colDescription') },
  { key: 'amount', label: t('reports.financial.colAmount') },
]);

/** name month sesuai locale, untuk dropdown filter period. */
const monthNames = computed(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: fmtNamaBulan(i + 1) })));

const arusKas = computed(() => summary.value.arus_kas ?? summary.value.pemasukan - summary.value.pengeluaran);
const laba = computed(() => summary.value.laba ?? arusKas.value);

function monthRange(): { from: string; until: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${filters.year}-${pad(filters.month)}-01`;
  const lastDay = new Date(filters.year, filters.month, 0).getDate();
  const until = `${filters.year}-${pad(filters.month)}-${pad(lastDay)}`;
  return { from, until };
}

async function load() {
  loading.value = true;
  error.value = '';
  const { from, until } = monthRange();
  try {
    // BE no punya GET /reports/financial; summary diambil from /reports/cashflow (per-period, filter[from]/filter[until])
    const rows = await apiGet<Array<{ period: string; pemasukan: number; pengeluaran: number; laba: number }>>(
      '/reports/cashflow',
      { 'filter[from]': from, 'filter[until]': until },
    );
    const row = rows?.[0];
    summary.value = row
      ? { pemasukan: row.pemasukan, pengeluaran: row.pengeluaran, laba: row.laba, arus_kas: row.pemasukan - row.pengeluaran }
      : { pemasukan: 0, pengeluaran: 0 };
  } catch (e) {
    error.value = errorMessage(e, t('reports.financial.unavailable'));
    summary.value = { pemasukan: 0, pengeluaran: 0 };
  }
  try {
    // BE: reports module mount di root -> GET /financial-entries (bukan /reports/financial-entries); filter pakai filter[from]/filter[until]
    const res = await apiGetFull<EntryRow[]>('/financial-entries', {
      page: page.value,
      limit,
      'filter[from]': from,
      'filter[until]': until,
    });
    entries.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? entries.value.length;
  } catch {
    entries.value = [];
  }
  loading.value = false;
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('reports.financial.title')" :subtitle="t('reports.financial.subtitle')">
      <template #actions>
        <RouterLink v-can="'report.view'" class="btn-outline" :to="{ name: 'payouts' }">
          {{ t('reports.financial.payoutQueue') }}
        </RouterLink>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <template v-else>
      <div v-if="error" class="mb-4 alert-warning">{{ error }}</div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard :label="t('reports.financial.income')" :value="fmtRp(summary.pemasukan)" />
        <KpiCard :label="t('reports.financial.expenses')" :value="fmtRp(summary.pengeluaran)" />
        <KpiCard :label="t('reports.financial.cashFlow')" :value="fmtRp(arusKas)" :accent="arusKas >= 0" />
        <KpiCard :label="t('reports.financial.profit')" :value="fmtRp(laba)" accent />
      </div>

      <h2 class="section-title mt-8">{{ t('reports.financial.entriesTitle') }}</h2>
      <div class="mt-3">
        <DataTable :columns="columns" :rows="entries" :loading="false" :empty="t('reports.financial.emptyEntries')">
          <template #toolbar>
            <div>
              <label class="label">{{ t('reports.financial.month') }}</label>
              <select v-model.number="filters.month" class="input w-auto" @change="page = 1; load()">
                <option v-for="m in monthNames" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>
            <div>
              <label class="label">{{ t('reports.financial.year') }}</label>
              <input v-model.number="filters.year" type="number" class="input w-24" @change="load" />
            </div>
          </template>
          <template #cell:type="{ value }">
            <span :class="value === 'income' ? 'text-emerald-700' : 'text-rose-700'">
              {{ value === 'income' ? t('reports.financial.typeIncome') : t('reports.financial.typeExpense') }}
            </span>
          </template>
          <template #cell:amount="{ value }">{{ fmtRp(value as number | string) }}</template>
          <template #cell:date="{ value }">{{ value ? fmtTanggalSaja(String(value)) : '—' }}</template>
          <template #footer>
            <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
          </template>
        </DataTable>
      </div>
    </template>
  </div>
</template>
