<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtTanggal } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

// name field mengikuti apa yang benar-benar dikirim BE: kolom tabel
// `live_sessions` apa adanya, ditambah kolom hasil join. Aplikasi mobile
// membaca name yang sama, jadi ketiga lapisan memakai satu kosakata.
interface LiveSession {
  id: string;
  title: string;
  course_title?: string | null;
  provider?: string; // zoom | bbb | meet
  url_join?: string;
  host_name?: string | null;
  start_time: string;
  end_time?: string;
  status: string; // dijadwalkan | berlangsung | finish | rekaman_tersedia
  kapasitas_maks?: number | null;
  amount_hadir?: number;
}

const auth = useAuthStore();
const { t } = useI18n();
const sessions = ref<LiveSession[]>([]);
const loading = ref(true);
const error = ref('');
const statusFilter = ref('');

const statusOptions = computed(() => [
  { value: '', label: t('live.list.allStatus') },
  ...['scheduled', 'ongoing', 'completed', 'recording_available'].map((v) => ({
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
  if (!['scheduled', 'ongoing'].includes(s.status)) return false;
  const now = Date.now();
  const start = new Date(s.start_time).getTime();
  const toleranceMs = 15 * 60 * 1000; // toleransi 15 menit sebelum start
  const end = s.end_time ? new Date(s.end_time).getTime() : start + 2 * 60 * 60 * 1000;
  return now >= start - toleranceMs && now <= end;
}

function joinLabel(s: LiveSession): string {
  if (s.status === 'recording_available') return t('live.list.recording');
  if (s.status === 'completed') return t('live.list.ended');
  return isJoinable(s) ? t('live.list.join') : t('live.list.notYet');
}

const grouped = computed(() => sessions.value);
const joiningId = ref<string | null>(null);

// ── Membuat sesi ──────────────────────────────────────────────────────────
// `POST /live-sessions` sudah ada sejak awal tapi no pernah dipanggil layar
// mana pun, jadi sesi hanya bisa lahir from seeder. Formulir di bawah ini yang
// membuatnya bisa dijadwalkan from panel.

interface Pilihan {
  id: string;
  title: string;
}
interface PenggunaRingkas {
  id: string;
  name_lengkap: string;
}

const canCreate = auth.can('live_class.create');
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const courses = ref<Pilihan[]>([]);
const hosts = ref<PenggunaRingkas[]>([]);

const form = ref({
  course_id: '',
  title: '',
  description: '',
  provider: 'zoom' as 'zoom' | 'meet' | 'bbb',
  url_join: '',
  host_user_id: '',
  date: '',
  jam_start: '',
  jam_finish: '',
  kapasitas_maks: '' as number | '',
  toleransi_terlambat_menit: 15,
});

async function loadFormOptions() {
  if (courses.value.length) return;
  const [c, h] = await Promise.all([
    apiGetFull<Pilihan[]>('/courses', { limit: 100 }).catch(() => null),
    apiGetFull<PenggunaRingkas[]>('/users', { limit: 100, 'filter[role]': 'instructor' }).catch(() => null),
  ]);
  courses.value = c?.data ?? [];
  hosts.value = h?.data ?? [];
}

async function openForm() {
  formError.value = '';
  showForm.value = true;
  await loadFormOptions();
  // Pembawa acara paling sering adalah orang yang menjadwalkan.
  if (!form.value.host_user_id && auth.user?.id) form.value.host_user_id = auth.user.id;
}

/** Gabungkan date + jam lokal jadi ISO yang diminta backend. */
function toIso(date: string, jam: string): string | null {
  if (!date || !jam) return null;
  const d = new Date(`${date}T${jam}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function submitSession() {
  const f = form.value;
  const start = toIso(f.date, f.jam_start);
  const finish = toIso(f.date, f.jam_finish);
  if (!f.course_id) return void (formError.value = t('live.form.courseRequired'));
  if (f.title.trim().length < 2) return void (formError.value = t('live.form.titleRequired'));
  if (!f.url_join.trim()) return void (formError.value = t('live.form.linkRequired'));
  if (!f.host_user_id) return void (formError.value = t('live.form.hostRequired'));
  if (!start || !finish) return void (formError.value = t('live.form.timeRequired'));
  if (new Date(finish) <= new Date(start)) return void (formError.value = t('live.form.timeOrder'));

  saving.value = true;
  formError.value = '';
  try {
    await apiPost('/live-sessions', {
      course_id: f.course_id,
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      provider: f.provider,
      url_join: f.url_join.trim(),
      host_user_id: f.host_user_id,
      start_time: start,
      end_time: finish,
      kapasitas_maks: f.kapasitas_maks === '' ? undefined : Number(f.kapasitas_maks),
      toleransi_terlambat_menit: Number(f.toleransi_terlambat_menit) || 0,
    });
    showForm.value = false;
    form.value = { ...form.value, title: '', description: '', url_join: '', date: '', jam_start: '', jam_finish: '', kapasitas_maks: '' };
    await load();
  } catch (e) {
    formError.value = errorMessage(e, t('live.form.saveFailed'));
  } finally {
    saving.value = false;
  }
}

/**
 * Gabung WAJIB lewat POST /live-sessions/:id/join, bukan membuka url_join
 * langsung. Endpointst itulah yang memeriksa user benar-benar terdaftar di
 * course/cohort, menegakkan jendela time, lalu **mencatat kehadiran otomatis**
 * (hadir / terlambat sesuai toleransi sesi). Membuka tautannya sendiri
 * melewatkan ketiganya — absensi no pernah tercatat.
 */
async function gabung(s: LiveSession) {
  // Jendela dibuka sebelum await: peramban memblokir window.open yang no
  // langsung berasal from klik user.
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
        <RouterLink to="/d/live-class/calendar" class="btn-outline">{{ t('live.list.calendar') }}</RouterLink>
        <button v-if="canCreate" class="btn-primary" @click="openForm">{{ t('live.form.add') }}</button>
      </template>
    </PageHeader>

    <!-- Penjadwalan sesi -->
    <div v-if="showForm" class="card mb-4 p-5">
      <h3 class="card-title">{{ t('live.form.title') }}</h3>
      <p v-if="formError" class="mt-2 alert-error">{{ formError }}</p>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('live.form.course') }}</label>
          <select v-model="form.course_id" class="input">
            <option value="">{{ t('common.action.choose') }}</option>
            <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
          </select>
        </div>
        <div>
          <label class="label">{{ t('live.form.sessionTitle') }}</label>
          <input v-model="form.title" class="input" :placeholder="t('live.form.sessionTitlePlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('live.form.provider') }}</label>
          <select v-model="form.provider" class="input">
            <option value="zoom">Zoom</option>
            <option value="meet">Google Meet</option>
            <option value="bbb">BigBlueButton</option>
          </select>
        </div>
        <div>
          <label class="label">{{ t('live.form.host') }}</label>
          <select v-model="form.host_user_id" class="input">
            <option value="">{{ t('common.action.choose') }}</option>
            <option v-for="h in hosts" :key="h.id" :value="h.id">{{ h.name_lengkap }}</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label">{{ t('live.form.link') }}</label>
          <input v-model="form.url_join" class="input" placeholder="https://zoom.us/j/…" />
          <p class="mt-1 text-xs text-slate-400">{{ t('live.form.linkHint') }}</p>
        </div>
        <div>
          <label class="label">{{ t('live.form.date') }}</label>
          <input v-model="form.date" type="date" class="input" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label">{{ t('live.form.start') }}</label>
            <input v-model="form.jam_start" type="time" class="input" />
          </div>
          <div>
            <label class="label">{{ t('live.form.end') }}</label>
            <input v-model="form.jam_finish" type="time" class="input" />
          </div>
        </div>
        <div>
          <label class="label">{{ t('live.form.capacity') }}</label>
          <input v-model="form.kapasitas_maks" type="number" min="1" class="input" :placeholder="t('live.form.capacityUnlimited')" />
        </div>
        <div>
          <label class="label">{{ t('live.form.lateTolerance') }}</label>
          <input v-model.number="form.toleransi_terlambat_menit" type="number" min="0" class="input" />
          <p class="mt-1 text-xs text-slate-400">{{ t('live.form.lateToleranceHint') }}</p>
        </div>
        <div class="sm:col-span-2">
          <label class="label">{{ t('live.form.description') }}</label>
          <textarea v-model="form.description" rows="2" class="input" :placeholder="t('live.form.optional')"></textarea>
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-outline" @click="showForm = false">{{ t('common.action.cancel') }}</button>
        <button class="btn-primary" :disabled="saving" @click="submitSession">
          {{ saving ? t('common.state.saving') : t('live.form.schedule') }}
        </button>
      </div>
    </div>

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
            <div class="text-xs text-slate-400">{{ s.course_title || '—' }}</div>
            <h3 class="card-title">{{ s.title }}</h3>
          </div>
          <StatusChip :status="s.status" />
        </div>
        <div class="text-sm text-slate-500">
          <div class="num">{{ fmtTanggal(s.start_time) }}</div>
          <div v-if="s.host_name">{{ t('live.list.host', { name: s.host_name }) }}</div>
          <div v-if="s.kapasitas_maks">
            {{ t('live.list.participants', { joined: fmtAngka(s.amount_hadir ?? 0), capacity: fmtAngka(s.kapasitas_maks) }) }}
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
            :to="`/d/live-class/${s.id}/attendance`"
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
