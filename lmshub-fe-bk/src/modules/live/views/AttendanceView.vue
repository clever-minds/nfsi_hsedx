<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtJam } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

interface AttendanceRecord extends Record<string, unknown> {
  user_id: string;
  nama: string;
  status: string; // belum | hadir | terlambat | absen
  waktu_join?: string;
  durasi_menit?: number;
}

const route = useRoute();
const sessionId = route.params.id as string;
const auth = useAuthStore();
const { t } = useI18n();

const rows = ref<AttendanceRecord[]>([]);
const loading = ref(true);
const error = ref('');
const savingId = ref<string | null>(null);

const columns = computed(() => [
  { key: 'nama', label: t('live.attendance.colParticipant') },
  { key: 'status', label: t('live.attendance.colStatus') },
  { key: 'waktu_join', label: t('live.attendance.colJoinTime') },
  { key: 'durasi_menit', label: t('live.attendance.colDuration') },
]);

const statuses = ['hadir', 'terlambat', 'absen'];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE: live module mount di root -> GET /live-sessions/:id/attendance (bukan /live/sessions/...)
    const res = await apiGetFull<AttendanceRecord[]>(`/live-sessions/${sessionId}/attendance`);
    rows.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('live.attendance.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function markManual(row: AttendanceRecord, status: string) {
  const prev = row.status;
  row.status = status; // optimistic
  savingId.value = row.user_id;
  try {
    // BE: POST /live-sessions/:id/attendance dengan body { user_id, status } (bukan sub-path per user + PATCH)
    await apiPost(`/live-sessions/${sessionId}/attendance`, { user_id: row.user_id, status });
  } catch (e) {
    row.status = prev; // rollback
    error.value = errorMessage(e, t('live.attendance.markFailed'));
  } finally {
    savingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('live.attendance.title')" :subtitle="t('live.attendance.subtitle')">
      <template #actions>
        <RouterLink to="/d/live-class" class="btn-outline">{{ t('live.attendance.back') }}</RouterLink>
      </template>
    </PageHeader>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('live.attendance.empty')">
      <template #cell:status="{ row }">
        <StatusChip :status="(row as AttendanceRecord).status" />
      </template>
      <template #cell:waktu_join="{ value }">
        {{ value ? fmtJam(value as string) : '—' }}
      </template>
      <template #cell:durasi_menit="{ value }">
        {{ value ? t('live.attendance.minutes', { n: fmtAngka(value as number) }) : '—' }}
      </template>
      <template v-if="auth.can('live_class.update')" #actions="{ row }">
        <select
          class="input text-xs"
          :value="(row as AttendanceRecord).status"
          :disabled="savingId === (row as AttendanceRecord).user_id"
          @change="markManual(row as AttendanceRecord, ($event.target as HTMLSelectElement).value)"
        >
          <option value="belum">{{ t('live.attendance.status.belum') }}</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ t(`live.attendance.status.${s}`) }}</option>
        </select>
      </template>
    </DataTable>
  </div>
</template>
