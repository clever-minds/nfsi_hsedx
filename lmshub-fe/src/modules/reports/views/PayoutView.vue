<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtRp, fmtTanggalSaja } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import KpiCard from '@/components/ui/KpiCard.vue';

type PayoutRow = Record<string, unknown> & {
  id: string;
  instruktur_name?: string;
  period?: string;
  amount: number;
  status: string; // menunggu_approval | disetujui | pencairan | finish | ditolak
  created_at?: string;
};

const auth = useAuthStore();
const { t } = useI18n();

const columns = computed(() => [
  { key: 'instruktur_name', label: t('reports.payout.colInstructor') },
  { key: 'period', label: t('reports.payout.colPeriod') },
  { key: 'amount', label: t('reports.payout.colAmount') },
  { key: 'status', label: t('reports.payout.colStatus') },
  { key: 'created_at', label: t('reports.payout.colSubmitted') },
]);

const STATUS_OPTIONS = ['awaiting_approval', 'approved', 'disbursement', 'completed', 'rejected'];

const rows = ref<PayoutRow[]>([]);
const loading = ref(true);
const error = ref('');
const filterStatus = ref('');
const page = ref(1);
const limit = 20;
const total = ref(0);
const busyId = ref<string | null>(null);

const canApprove = computed(
  () => auth.can('report.update') && ['director', 'super_admin'].includes(auth.activeRole ?? ''),
);
// Dihitung backend lewat SUM di database dan dikirim di `meta.total_pending`,
// bukan dijumlahkan from baris yang tampil — halaman hanya memuat 20 baris.
const totalPending = ref(0);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE: reports module mount di root -> GET /payouts (bukan /reports/payouts); filter status pakai key filter[status]
    const res = await apiGetFull<PayoutRow[]>('/payouts', {
      page: page.value,
      limit,
      'filter[status]': filterStatus.value || undefined,
    });
    rows.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? rows.value.length;
    totalPending.value = Number(res.meta?.total_pending ?? 0);
  } catch (e) {
    error.value = errorMessage(e, t('reports.payout.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function approve(row: PayoutRow) {
  if (!window.confirm(t('reports.payout.confirmApprove', { name: row.instruktur_name ?? '', amount: fmtRp(row.amount) }))) return;
  busyId.value = row.id;
  try {
    // BE: POST /payouts/:id/approve dengan body { action: 'approve' }
    await apiPost(`/payouts/${row.id}/approve`, { action: 'approve' });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('reports.payout.approveFailed'));
  } finally {
    busyId.value = null;
  }
}

async function reject(row: PayoutRow) {
  const reason = window.prompt(t('reports.payout.promptReject', { name: row.instruktur_name ?? '' }));
  if (!reason) return;
  busyId.value = row.id;
  try {
    // BE: reject juga lewat POST /payouts/:id/approve dengan action: 'reject' (no ada endpointst /reject terpisah)
    await apiPost(`/payouts/${row.id}/approve`, { action: 'reject', notes_approval: reason });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('reports.payout.rejectFailed'));
  } finally {
    busyId.value = null;
  }
}

async function pay(row: PayoutRow) {
  if (!window.confirm(t('reports.payout.confirmPay', { amount: fmtRp(row.amount), name: row.instruktur_name ?? '' })))
    return;
  busyId.value = row.id;
  try {
    // (hanya GET /payouts dan POST /payouts/:id/approve). Dibiarkan agar no crash; akan 404 di server.
    await apiPost(`/payouts/${row.id}/pay`);
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('reports.payout.payFailed'));
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('reports.payout.title')" :subtitle="t('reports.payout.subtitle')">
      <template #actions>
        <RouterLink class="btn-outline" :to="{ name: 'reports' }">{{ t('reports.payout.back') }}</RouterLink>
      </template>
    </PageHeader>

    <div class="mb-4 grid gap-4 sm:grid-cols-2">
      <KpiCard
        :label="t('reports.payout.pendingKpi')"
        :value="fmtRp(totalPending)"
        :hint="t('reports.payout.pendingHint')"
      />
    </div>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('reports.payout.empty')">
      <template #toolbar>
        <div>
          <label class="label">{{ t('reports.payout.filterStatus') }}</label>
          <select v-model="filterStatus" class="input w-auto" @change="page = 1; load()">
            <option value="">{{ t('reports.payout.all') }}</option>
            <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ t(`reports.payout.status.${s}`) }}</option>
          </select>
        </div>
      </template>
      <template #cell:amount="{ value }">{{ fmtRp(value as number | string) }}</template>
      <template #cell:status="{ value }"><StatusChip :status="String(value)" /></template>
      <template #cell:created_at="{ value }">{{ value ? fmtTanggalSaja(String(value)) : '—' }}</template>
      <template #actions="{ row }">
        <div v-if="canApprove" class="flex justify-end gap-2">
          <template v-if="(row as PayoutRow).status === 'awaiting_approval'">
            <button
              v-can="'report.update'"
              class="btn-outline btn-sm"
              :disabled="busyId === (row as PayoutRow).id"
              @click="approve(row as PayoutRow)"
            >
              {{ t('reports.payout.approve') }}
            </button>
            <button
              v-can="'report.update'"
              class="btn-outline btn-sm text-rose-600"
              :disabled="busyId === (row as PayoutRow).id"
              @click="reject(row as PayoutRow)"
            >
              {{ t('reports.payout.reject') }}
            </button>
          </template>
          <button
            v-if="(row as PayoutRow).status === 'approved'"
            v-can="'report.update'"
            class="btn-primary btn-sm"
            :disabled="busyId === (row as PayoutRow).id"
            @click="pay(row as PayoutRow)"
          >
            {{ t('reports.payout.disburse') }}
          </button>
        </div>
        <span v-else class="text-xs text-slate-400">{{ t('reports.payout.directorOnly') }}</span>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
      </template>
    </DataTable>
  </div>
</template>
