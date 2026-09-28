<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtRp, fmtTanggalSaja } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

const auth = useAuthStore();
const { t } = useI18n();
// "Customer" = pengguna yang hanya berperan siswa/sub_user (bukan staf). Untuk mereka
// halaman ini adalah riwayat pembelian pribadi, bukan area manajemen transaksi.
const isCustomer = computed(
  () => auth.roles.length > 0 && auth.roles.every((r) => ['siswa', 'sub_user'].includes(r)),
);

type OrderRow = Record<string, unknown> & {
  id: string;
  kode?: string;
  pembeli_nama?: string;
  kursus_nama?: string;
  jalur: string; // online | manual
  status: string; // menunggu_pembayaran | dp_cicilan_berjalan | lunas | akses_aktif | batal
  total: number;
  marketing_nama?: string;
  created_at?: string;
};

// Kolom "Pembeli" tak relevan bagi customer (selalu dirinya sendiri) → disembunyikan.
const columns = computed(() =>
  [
    { key: 'kode', label: t('orders.list.colOrder') },
    ...(isCustomer.value ? [] : [{ key: 'pembeli_nama', label: t('orders.list.colBuyer') }]),
    { key: 'kursus_nama', label: t('orders.list.colCourse') },
    { key: 'jalur', label: t('orders.list.colChannel') },
    { key: 'status', label: t('orders.list.colStatus') },
    { key: 'total', label: t('orders.list.colTotal') },
    { key: 'created_at', label: t('orders.list.colDate') },
  ],
);

// Harus persis sama dengan enum `order_status` di basis data. Nilai yang tidak
// dikenal dulu diteruskan apa adanya ke query dan membuat server menjawab 500.
const STATUS_OPTIONS = ['menunggu_pembayaran', 'dp_cicilan_berjalan', 'lunas', 'akses_aktif', 'batal'];

const rows = ref<OrderRow[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

const filters = reactive({ jalur: '', status: '', q: '' });
const page = ref(1);
const limit = 20;
const total = ref(0);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<OrderRow[]>('/orders', {
      jalur: filters.jalur || undefined,
      status: filters.status || undefined,
      q: filters.q || undefined,
      page: page.value,
      limit,
    });
    rows.value = res.data ?? [];
    total.value = Number((res.meta as Record<string, unknown> | null)?.total ?? rows.value.length);
  } catch (e) {
    error.value = errorMessage(e, t('orders.list.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function canVerify(row: OrderRow): boolean {
  return ['menunggu_pembayaran', 'dp_cicilan_berjalan'].includes(row.status);
}
function canRefund(row: OrderRow): boolean {
  return ['lunas', 'akses_aktif'].includes(row.status);
}

async function verify(row: OrderRow, decision: 'approve' | 'reject') {
  const kode = row.kode ?? row.id;
  let alasan: string | undefined;
  if (decision === 'reject') {
    alasan = window.prompt(t('orders.list.promptReject', { code: kode })) || '';
    if (!alasan) return;
  } else if (!window.confirm(t('orders.list.confirmVerify', { code: kode, amount: fmtRp(row.total) }))) {
    return;
  }
  busyId.value = row.id;
  try {
    // BE: POST /orders/:id/verify (bukan PATCH). Nama medannya `aksi` /
    // `catatan_verifikasi` — mengirim `decision`/`alasan` ditolak validator
    // sebagai 400 dan tak satu pun transfer manual bisa dikonfirmasi.
    // `payment_id` boleh dikosongkan selama order hanya punya satu klaim
    // pembayaran yang menunggu, dan itu keadaan yang normal.
    await apiPost(`/orders/${row.id}/verify`, {
      aksi: decision === 'approve' ? 'verify' : 'reject',
      catatan_verifikasi: alasan,
    });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('orders.list.verifyFailed'));
  } finally {
    busyId.value = null;
  }
}

async function refund(row: OrderRow) {
  const alasan = window.prompt(
    t('orders.list.promptRefund', { code: row.kode ?? row.id, amount: fmtRp(row.total) }),
  );
  if (!alasan) return;
  busyId.value = row.id;
  try {
    await apiPost(`/orders/${row.id}/refund`, { alasan });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('orders.list.refundFailed'));
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader
      :title="isCustomer ? t('orders.list.titleCustomer') : t('orders.list.titleStaff')"
      :subtitle="isCustomer ? t('orders.list.subtitleCustomer') : t('orders.list.subtitleStaff')"
    >
      <template v-if="!isCustomer" #actions>
        <RouterLink v-can="'transaksi.create'" class="btn-primary" :to="{ name: 'transaksi-tanda-jadi' }">
          {{ t('orders.list.addManual') }}
        </RouterLink>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <DataTable
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :empty="isCustomer ? t('orders.list.emptyCustomer') : t('orders.list.emptyStaff')"
    >
      <template #toolbar>
        <select v-model="filters.jalur" class="input w-auto" @change="search">
          <option value="">{{ t('orders.list.allChannels') }}</option>
          <option value="online">{{ t('orders.list.channelOnline') }}</option>
          <option value="manual">{{ t('orders.list.channelManual') }}</option>
        </select>
        <select v-model="filters.status" class="input w-auto" @change="search">
          <option value="">{{ t('orders.list.allStatus') }}</option>
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ t(`orders.list.status.${s}`) }}</option>
        </select>
        <input v-model="filters.q" class="input max-w-xs" :placeholder="t('orders.list.searchPlaceholder')" @keyup.enter="search" />
        <button class="btn-outline" @click="search">{{ t('common.action.search') }}</button>
      </template>
      <template #cell:jalur="{ value }">
        {{ value === 'manual' ? t('orders.list.channelManual') : t('orders.list.channelOnline') }}
      </template>
      <template #cell:status="{ value }">
        <StatusChip :status="String(value)" />
      </template>
      <template #cell:total="{ value }">{{ fmtRp(value as number | string) }}</template>
      <template #cell:created_at="{ value }">{{ value ? fmtTanggalSaja(String(value)) : '—' }}</template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-2">
          <template v-if="canVerify(row as OrderRow)">
            <button
              v-can="'transaksi.update'"
              class="btn-outline btn-sm"
              :disabled="busyId === (row as OrderRow).id"
              @click="verify(row as OrderRow, 'approve')"
            >
              {{ t('orders.list.verify') }}
            </button>
            <button
              v-can="'transaksi.update'"
              class="btn-outline btn-sm text-rose-600"
              :disabled="busyId === (row as OrderRow).id"
              @click="verify(row as OrderRow, 'reject')"
            >
              {{ t('orders.list.reject') }}
            </button>
          </template>
          <button
            v-if="canRefund(row as OrderRow)"
            v-can="'refund.update'"
            class="btn-outline btn-sm text-rose-600"
            :disabled="busyId === (row as OrderRow).id"
            @click="refund(row as OrderRow)"
          >
            {{ t('orders.list.refund') }}
          </button>
        </div>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
      </template>
    </DataTable>
  </div>
</template>
