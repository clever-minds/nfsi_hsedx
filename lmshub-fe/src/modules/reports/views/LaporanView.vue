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
  tanggal?: string;
  jenis: string; // pemasukan | pengeluaran
  /** BE mengirim `kategori_nama` (alias dari kategori_biaya.nama), bukan `kategori`. */
  kategori_nama?: string;
  deskripsi?: string;
  nominal: number;
};

const { t } = useI18n();

const now = new Date();
const filters = reactive({ bulan: now.getMonth() + 1, tahun: now.getFullYear() });

const summary = ref<FinancialSummary>({ pemasukan: 0, pengeluaran: 0 });
const entries = ref<EntryRow[]>([]);
const loading = ref(true);
const page = ref(1);
const limit = 20;
const total = ref(0);
const error = ref('');

const columns = computed(() => [
  { key: 'tanggal', label: t('reports.financial.colDate') },
  { key: 'jenis', label: t('reports.financial.colType') },
  { key: 'kategori_nama', label: t('reports.financial.colCategory') },
  { key: 'deskripsi', label: t('reports.financial.colDescription') },
  { key: 'nominal', label: t('reports.financial.colAmount') },
]);

/** Nama bulan sesuai locale, untuk dropdown filter periode. */
const monthNames = computed(() => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: fmtNamaBulan(i + 1) })));

const arusKas = computed(() => summary.value.arus_kas ?? summary.value.pemasukan - summary.value.pengeluaran);
const laba = computed(() => summary.value.laba ?? arusKas.value);

function monthRange(): { dari: string; sampai: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dari = `${filters.tahun}-${pad(filters.bulan)}-01`;
  const lastDay = new Date(filters.tahun, filters.bulan, 0).getDate();
  const sampai = `${filters.tahun}-${pad(filters.bulan)}-${pad(lastDay)}`;
  return { dari, sampai };
}

async function load() {
  loading.value = true;
  error.value = '';
  const { dari, sampai } = monthRange();
  try {
    // BE tidak punya GET /reports/financial; ringkasan diambil dari /reports/cashflow (per-periode, filter[dari]/filter[sampai])
    const rows = await apiGet<Array<{ periode: string; pemasukan: number; pengeluaran: number; laba: number }>>(
      '/reports/cashflow',
      { 'filter[dari]': dari, 'filter[sampai]': sampai },
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
    // BE: reports module mount di root -> GET /financial-entries (bukan /reports/financial-entries); filter pakai filter[dari]/filter[sampai]
    const res = await apiGetFull<EntryRow[]>('/financial-entries', {
      page: page.value,
      limit,
      'filter[dari]': dari,
      'filter[sampai]': sampai,
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
        <RouterLink v-can="'laporan.view'" class="btn-outline" :to="{ name: 'laporan-payout' }">
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
              <select v-model.number="filters.bulan" class="input w-auto" @change="page = 1; load()">
                <option v-for="m in monthNames" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>
            <div>
              <label class="label">{{ t('reports.financial.year') }}</label>
              <input v-model.number="filters.tahun" type="number" class="input w-24" @change="load" />
            </div>
          </template>
          <template #cell:jenis="{ value }">
            <span :class="value === 'pemasukan' ? 'text-emerald-700' : 'text-rose-700'">
              {{ value === 'pemasukan' ? t('reports.financial.typeIncome') : t('reports.financial.typeExpense') }}
            </span>
          </template>
          <template #cell:nominal="{ value }">{{ fmtRp(value as number | string) }}</template>
          <template #cell:tanggal="{ value }">{{ value ? fmtTanggalSaja(String(value)) : '—' }}</template>
          <template #footer>
            <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
          </template>
        </DataTable>
      </div>
    </template>
  </div>
</template>
