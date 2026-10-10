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
  pelapor_name?: string;
  reason: string;
  status: string; // menunggu | disembunyikan | dihapus | ditolak
  created_at?: string;
}

const reports = ref<Report[]>([]);
const loading = ref(true);
const error = ref('');
const statusFilter = ref('pending');
const page = ref(1);
const limit = 20;
const total = ref(0);
const busyId = ref<string | null>(null);

const { t } = useI18n();

const columns = computed(() => [
  { key: 'konten_ringkas', label: t('discussions.moderationPage.colContent') },
  { key: 'pelapor_name', label: t('discussions.moderationPage.colReporter') },
  { key: 'reason', label: t('discussions.moderationPage.colReason') },
  { key: 'status', label: t('discussions.moderationPage.colStatus') },
]);

const STATUS_OPTIONS = ['pending', 'disembunyikan', 'dihapus', 'rejected'];

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

const TINDAKAN_MAP: Record<'hide' | 'delete' | 'blokir', 'hide' | 'delete' | 'block_user'> = {
  sembunyikan: 'hide',
  delete: 'delete',
  blokir: 'block_user',
};

async function act(r: Report, action: 'hide' | 'delete' | 'blokir') {
  const notes = window.prompt(t('discussions.moderationPage.promptReason', { action: t(`discussions.moderationPage.action.${action}`) }));
  if (!notes) return;
  busyId.value = r.id;
  try {
    // BE: PATCH /discussions/reports/:id dengan body { status: 'actioned', action, handling_notes }
    await apiPatch(`/discussions/reports/${r.id}`, {
      status: 'actioned',
      action: TINDAKAN_MAP[action],
      handling_notes: notes,
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
        <RouterLink to="/d/discussions" class="btn-outline">{{ t('discussions.moderationPage.back') }}</RouterLink>
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
            @click="act(row as Report, 'hide')"
          >
            {{ t('discussions.moderationPage.hide') }}
          </button>
          <button
            class="btn-outline text-xs text-rose-600"
            :disabled="busyId === (row as Report).id"
            @click="act(row as Report, 'delete')"
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
