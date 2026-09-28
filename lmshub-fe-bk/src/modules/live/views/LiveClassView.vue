<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtTanggal } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

// Nama field mengikuti apa yang benar-benar dikirim BE: kolom tabel
// `live_sessions` apa adanya, ditambah kolom hasil join. Aplikasi mobile
// membaca nama yang sama, jadi ketiga lapisan memakai satu kosakata.
interface LiveSession {
  id: string;
  judul: string;
  kursus_judul?: string | null;
  penyedia?: string; // zoom | bbb | meet
  url_join?: string;
  host_nama?: string | null;
  waktu_mulai: string;
  waktu_selesai?: string;
  status: string; // dijadwalkan | berlangsung | selesai | rekaman_tersedia
  kapasitas_maks?: number | null;
  jumlah_hadir?: number;
}

const auth = useAuthStore();
const { t } = useI18n();
const sessions = ref<LiveSession[]>([]);
const loading = ref(true);
const error = ref('');
const statusFilter = ref('');

const statusOptions = computed(() => [
  { value: '', label: t('live.list.allStatus') },
  ...['dijadwalkan', 'berlangsung', 'selesai', 'rekaman_tersedia'].map((v) => ({
    value: v,
    label: t(`live.list.status.${v}`),
  })),
]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE: live module mount di root -> GET /live-sessions (bukan /live/sessions)
    const res = await apiGetFull<LiveSession[]>('/live-sessions', {
      status: statusFilter.value || undefined,
    });
    sessions.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('live.list.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function isJoinable(s: LiveSession): boolean {
  if (!['dijadwalkan', 'berlangsung'].includes(s.status)) return false;
  const now = Date.now();
  const start = new Date(s.waktu_mulai).getTime();
  const toleranceMs = 15 * 60 * 1000; // toleransi 15 menit sebelum mulai
  const end = s.waktu_selesai ? new Date(s.waktu_selesai).getTime() : start + 2 * 60 * 60 * 1000;
  return now >= start - toleranceMs && now <= end;
}

function joinLabel(s: LiveSession): string {
  if (s.status === 'rekaman_tersedia') return t('live.list.recording');
  if (s.status === 'selesai') return t('live.list.ended');
  return isJoinable(s) ? t('live.list.join') : t('live.list.notYet');
}

const grouped = computed(() => sessions.value);
const joiningId = ref<string | null>(null);

/**
 * Gabung WAJIB lewat POST /live-sessions/:id/join, bukan membuka url_join
 * langsung. Endpoint itulah yang memeriksa pengguna benar-benar terdaftar di
 * kursus/cohort, menegakkan jendela waktu, lalu **mencatat kehadiran otomatis**
 * (hadir / terlambat sesuai toleransi sesi). Membuka tautannya sendiri
 * melewatkan ketiganya — absensi tidak pernah tercatat.
 */
async function gabung(s: LiveSession) {
  // Jendela dibuka sebelum await: peramban memblokir window.open yang tidak
  // langsung berasal dari klik pengguna.
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  joiningId.value = s.id;
  error.value = '';
  try {
    const res = await apiPost<{ url_join: string }>(`/live-sessions/${s.id}/join`, {});
    if (!res?.url_join) throw new Error('no url');
    if (win) win.location.href = res.url_join;
    else window.location.href = res.url_join;
  } catch (e) {
    win?.close();
    error.value = errorMessage(e, t('live.list.joinFailed'));
  } finally {
    joiningId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('live.list.title')" :subtitle="t('live.list.subtitle')">
      <template #actions>
        <RouterLink to="/d/live-class/kalender" class="btn-outline">{{ t('live.list.calendar') }}</RouterLink>
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-wrap gap-2">
      <select v-model="statusFilter" class="input max-w-[220px]" @change="load">
        <option v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </div>

    <div v-if="loading" class="text-slate-400">{{ t('live.list.loading') }}</div>
    <div v-else-if="error" class="alert-error">{{ error }}</div>
    <p v-else-if="!grouped.length" class="empty-state">{{ t('live.list.empty') }}</p>
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div v-for="s in grouped" :key="s.id" class="card flex flex-col gap-3 p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs text-slate-400">{{ s.kursus_judul || '—' }}</div>
            <h3 class="card-title">{{ s.judul }}</h3>
          </div>
          <StatusChip :status="s.status" />
        </div>
        <div class="text-sm text-slate-500">
          <div class="num">{{ fmtTanggal(s.waktu_mulai) }}</div>
          <div v-if="s.host_nama">{{ t('live.list.host', { name: s.host_nama }) }}</div>
          <div v-if="s.kapasitas_maks">
            {{ t('live.list.participants', { joined: fmtAngka(s.jumlah_hadir ?? 0), capacity: fmtAngka(s.kapasitas_maks) }) }}
          </div>
        </div>
        <div class="mt-auto flex flex-wrap gap-2">
          <button
            v-if="isJoinable(s)"
            class="btn-primary flex-1"
            :disabled="joiningId === s.id"
            @click="gabung(s)"
          >
            {{ joiningId === s.id ? t('common.state.loading') : joinLabel(s) }}
          </button>
          <button v-else class="btn-outline flex-1 cursor-not-allowed opacity-60" disabled :title="joinLabel(s)">
            {{ joinLabel(s) }}
          </button>
          <RouterLink
            v-can="'live_class.view'"
            :to="`/d/live-class/${s.id}/kehadiran`"
            class="btn-outline flex-1 text-center"
          >
            {{ t('live.list.attendance') }}
          </RouterLink>
        </div>
      </div>
    </div>
    <p v-if="!auth.can('live_class.view')" class="mt-4 text-xs text-slate-400">{{ t('live.list.scopeNote') }}</p>
  </div>
</template>
