<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPatch, errorMessage } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

interface Report extends Record<string, unknown> {
  id: string;
  target_type: string;
  konten_ringkas?: string;
  pelapor_nama?: string;
  alasan: string;
  status: string; // menunggu | disembunyikan | dihapus | ditolak
  dibuat_at?: string;
}

const reports = ref<Report[]>([]);
const loading = ref(true);
const error = ref('');
const statusFilter = ref('menunggu');
const page = ref(1);
const limit = 20;
const total = ref(0);
const busyId = ref<string | null>(null);

const { t } = useI18n();

const columns = computed(() => [
  { key: 'konten_ringkas', label: t('discussions.moderationPage.colContent') },
  { key: 'pelapor_nama', label: t('discussions.moderationPage.colReporter') },
  { key: 'alasan', label: t('discussions.moderationPage.colReason') },
  { key: 'status', label: t('discussions.moderationPage.colStatus') },
]);

const STATUS_OPTIONS = ['menunggu', 'disembunyikan', 'dihapus', 'ditolak'];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE: GET /discussions/reports (bukan /discussions/moderation), filter status pakai key filter[status]
    const res = await apiGetFull<Report[]>('/discussions/reports', {
      page: page.value,
      limit,
      'filter[status]': statusFilter.value || undefined,
    });
    reports.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? reports.value.length;
  } catch (e) {
    error.value = errorMessage(e, t('discussions.moderationPage.loadFailed'));
  } finally {
    loading.value = false;
  }
}

const TINDAKAN_MAP: Record<'sembunyikan' | 'hapus' | 'blokir', 'sembunyikan' | 'hapus' | 'blokir_pengguna'> = {
  sembunyikan: 'sembunyikan',
  hapus: 'hapus',
  blokir: 'blokir_pengguna',
};

async function act(r: Report, aksi: 'sembunyikan' | 'hapus' | 'blokir') {
  const catatan = window.prompt(t('discussions.moderationPage.promptReason', { action: t(`discussions.moderationPage.action.${aksi}`) }));
  if (!catatan) return;
  busyId.value = r.id;
  try {
    // BE: PATCH /discussions/reports/:id dengan body { status: 'ditindak', tindakan, catatan_penanganan }
    await apiPatch(`/discussions/reports/${r.id}`, {
      status: 'ditindak',
      tindakan: TINDAKAN_MAP[aksi],
      catatan_penanganan: catatan,
    });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('discussions.moderationPage.actionFailed'));
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('discussions.moderationPage.title')" :subtitle="t('discussions.moderationPage.subtitle')">
      <template #actions>
        <RouterLink to="/d/diskusi" class="btn-outline">{{ t('discussions.moderationPage.back') }}</RouterLink>
      </template>
    </PageHeader>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <DataTable :columns="columns" :rows="reports" :loading="loading" :empty="t('discussions.moderationPage.empty')">
      <template #toolbar>
        <select v-model="statusFilter" class="input max-w-[220px]" @change="page = 1; load()">
          <option value="">{{ t('discussions.moderationPage.allStatus') }}</option>
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ t(`discussions.moderationPage.status.${s}`) }}</option>
        </select>
      </template>
      <template #cell:status="{ value }">
        <StatusChip :status="value as string" />
      </template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-1">
          <button
            class="btn-outline text-xs"
            :disabled="busyId === (row as Report).id"
            @click="act(row as Report, 'sembunyikan')"
          >
            {{ t('discussions.moderationPage.hide') }}
          </button>
          <button
            class="btn-outline text-xs text-rose-600"
            :disabled="busyId === (row as Report).id"
            @click="act(row as Report, 'hapus')"
          >
            {{ t('discussions.moderationPage.delete') }}
          </button>
          <button
            class="btn-outline text-xs"
            :disabled="busyId === (row as Report).id"
            @click="act(row as Report, 'blokir')"
          >
            {{ t('discussions.moderationPage.block') }}
          </button>
        </div>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
      </template>
    </DataTable>
  </div>
</template>
