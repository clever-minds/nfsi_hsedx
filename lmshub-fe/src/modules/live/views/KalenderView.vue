<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, errorMessage } from '@/lib/api';
import { currentLocaleDef } from '@/i18n';
import { fmtJam } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';

// Mengikuti kolom tabel calendar_events + kolom join. `sumber` memakai
// kosakata BE ('live_session' | 'tugas' | 'kuis' | 'lainnya'); view ini
// sebelumnya membaca `tipe` dengan kosakata karangan sendiri, jadi legenda
// tidak pernah cocok dan semua acara jatuh ke penanda default.
interface CalendarEvent {
  id: string;
  judul: string;
  sumber: 'live_session' | 'tugas' | 'kuis' | 'lainnya' | string;
  kursus_judul?: string | null;
  waktu_mulai: string;
}

const { t } = useI18n();

const events = ref<CalendarEvent[]>([]);
const loading = ref(true);
const error = ref('');

const legend = computed<Record<string, { label: string; mark: string; class: string }>>(() => ({
  live_session: { label: t('live.calendarPage.legend.live'), mark: '■', class: 'text-brand-600' },
  tugas: { label: t('live.calendarPage.legend.tenggat'), mark: '▲', class: 'text-accent-500' },
  kuis: { label: t('live.calendarPage.legend.ujian'), mark: '★', class: 'text-rose-500' },
}));

function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function endOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE: live module mount di root -> GET /calendar (bukan /live/calendar)
    const res = await apiGetFull<CalendarEvent[]>('/calendar', {
      'filter[from]': startOfMonth(),
      'filter[to]': endOfMonth(),
    });
    events.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('live.calendarPage.loadFailed'));
  } finally {
    loading.value = false;
  }
}

// Tampilan agenda (list per tanggal) — mobile-first, bukan grid bulan penuh.
const agenda = computed(() => {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of [...events.value].sort((a, b) => a.waktu_mulai.localeCompare(b.waktu_mulai))) {
    const key = new Date(e.waktu_mulai).toLocaleDateString(currentLocaleDef().intl, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(e);
  }
  return Array.from(byDate.entries());
});

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('live.calendarPage.title')" :subtitle="t('live.calendarPage.subtitle')" />

    <div class="mb-4 flex flex-wrap gap-4 text-sm">
      <span v-for="(v, k) in legend" :key="k" class="inline-flex items-center gap-1 text-slate-500">
        <span :class="v.class">{{ v.mark }}</span> {{ v.label }}
      </span>
    </div>

    <div v-if="loading" class="text-slate-400">{{ t('live.calendarPage.loading') }}</div>
    <div v-else-if="error" class="card p-6 text-slate-500">{{ error }}</div>
    <p v-else-if="!agenda.length" class="empty-state">{{ t('live.calendarPage.empty') }}</p>
    <div v-else class="space-y-5">
      <div v-for="[date, items] in agenda" :key="date">
        <h3 class="mb-2 text-sm font-semibold text-brand-900">{{ date }}</h3>
        <div class="space-y-2">
          <div v-for="e in items" :key="e.id" class="card flex items-center gap-3 p-3">
            <span :class="legend[e.sumber]?.class || 'text-slate-400'" class="text-lg">{{ legend[e.sumber]?.mark || '•' }}</span>
            <div class="min-w-0 flex-1">
              <div class="truncate card-title">{{ e.judul }}</div>
              <div class="text-xs text-slate-400">{{ e.kursus_judul || '—' }} · <span class="num">{{ fmtJam(e.waktu_mulai) }}</span></div>
            </div>
            <span class="text-xs text-slate-400">{{ legend[e.sumber]?.label || e.sumber }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
