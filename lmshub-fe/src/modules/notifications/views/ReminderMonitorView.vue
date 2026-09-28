<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, errorMessage } from '@/lib/api';
import { fmtTanggal } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

interface ReminderRecord extends Record<string, unknown> {
  id: string;
  jenis: string;
  penerima_nama: string;
  status: string; // terkirim | dibaca | direspons | eskalasi
  eskalasi_ke?: string;
  dikirim_at?: string;
}

const reminders = ref<ReminderRecord[]>([]);
const loading = ref(true);
const error = ref('');
const statusFilter = ref('');
const page = ref(1);
const limit = 20;
const total = ref(0);

const { t } = useI18n();

const columns = computed(() => [
  { key: 'jenis', label: t('notifications.reminders.colType') },
  { key: 'penerima_nama', label: t('notifications.reminders.colRecipient') },
  { key: 'status', label: t('notifications.reminders.colStatus') },
  { key: 'eskalasi_ke', label: t('notifications.reminders.colEscalatedTo') },
  { key: 'dikirim_at', label: t('notifications.reminders.colSentAt') },
]);

const STATUS_OPTIONS = ['terkirim', 'dibaca', 'direspons', 'eskalasi'];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE: GET /notifications/reminders/monitor untuk lintas pengguna (bukan /notifications/reminders yang hanya milik pengguna login)
    const res = await apiGetFull<ReminderRecord[]>('/notifications/reminders/monitor', {
      page: page.value,
      limit,
      status: statusFilter.value || undefined,
    });
    reminders.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? reminders.value.length;
  } catch (e) {
    error.value = errorMessage(e, t('notifications.reminders.loadFailed'));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('notifications.reminders.title')" :subtitle="t('notifications.reminders.subtitle')">
      <template #actions>
        <RouterLink to="/d/notifikasi" class="btn-outline">{{ t('notifications.reminders.back') }}</RouterLink>
      </template>
    </PageHeader>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <DataTable :columns="columns" :rows="reminders" :loading="loading" :empty="t('notifications.reminders.empty')">
      <template #toolbar>
        <select v-model="statusFilter" class="input max-w-[220px]" @change="page = 1; load()">
          <option value="">{{ t('notifications.reminders.allStatus') }}</option>
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ t(`notifications.reminders.status.${s}`) }}</option>
        </select>
      </template>
      <template #cell:status="{ value }">
        <StatusChip :status="value as string" />
      </template>
      <template #cell:eskalasi_ke="{ value }">
        <span v-if="value" class="text-rose-600">→ {{ value }}</span>
        <span v-else class="text-slate-400">—</span>
      </template>
      <template #cell:dikirim_at="{ value }">
        {{ value ? fmtTanggal(value as string) : '—' }}
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
      </template>
    </DataTable>
  </div>
</template>
