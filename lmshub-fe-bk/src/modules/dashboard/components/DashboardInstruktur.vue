<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { fmtAngka, fmtHarga, fmtRelatif, fmtRp, fmtTanggal, initialsOf } from '@/lib/format';
import { statusLabel } from '@/lib/labels';
import KpiCard from '@/components/ui/KpiCard.vue';
import Icon from '@/components/ui/Icon.vue';

interface KursusSaya {
  id: string;
  judul: string;
  status_publikasi: string;
  jumlah_siswa: number | null;
  rating_avg: string | null;
  harga: string;
}
interface EnrollmentTerbaru { id: string; user_nama: string; course_judul: string; status: string; created_at: string }
interface JadwalLive { id: string; judul: string; waktu_mulai: string; status?: string }

const props = defineProps<{ data: Record<string, unknown> }>();
const auth = useAuthStore();
const { t } = useI18n();

const num = (k: string) => Number((props.data[k] as number | string | null) ?? 0);
const kpis = computed(() => [
  { label: t('dashboard.kpi.jumlah_kursus'), value: fmtAngka(num('jumlah_kursus')), icon: 'book-open' },
  { label: t('dashboard.kpi.jumlah_siswa'), value: fmtAngka(num('jumlah_siswa')), icon: 'users' },
  {
    label: t('dashboard.kpi.rating_rata_rata'),
    value: props.data.rating_rata_rata != null ? `★ ${Number(props.data.rating_rata_rata).toFixed(1)}` : '—',
    icon: 'award',
    accent: true,
  },
  { label: t('dashboard.kpi.pendapatan_bulan_ini'), value: fmtRp(num('pendapatan_bulan_ini')), icon: 'credit-card' },
]);

const kursusSaya = computed(() => (props.data.kursus_saya as KursusSaya[] | undefined) ?? []);
const enrollmentTerbaru = computed(() => (props.data.enrollment_terbaru as EnrollmentTerbaru[] | undefined) ?? []);
const jadwalLive = computed(() => (props.data.jadwal_live_terdekat as JadwalLive[] | undefined) ?? []);
const payoutPending = computed(() => num('payout_pending'));

const statusChip: Record<string, string> = {
  draf: 'bg-slate-100 text-slate-500',
  dalam_review: 'bg-amber-50 text-amber-600',
  terbit: 'bg-emerald-50 text-emerald-600',
  diperbarui: 'bg-sky-50 text-sky-600',
  diarsip: 'bg-slate-100 text-slate-400',
};

const thumbGradients = [
  'from-brand-400 to-brand-600',
  'from-slate-600 to-slate-800',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
];
const thumbClass = (i: number) => thumbGradients[i % thumbGradients.length];
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[1fr,20rem]">
    <!-- Kolom utama -->
    <div class="min-w-0 space-y-8">
      <!-- Hero instruktur -->
      <section class="relative overflow-hidden rounded-lg bg-gradient-to-r from-brand-50 to-orange-50 p-6 sm:p-8">
        <div class="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-black text-slate-900">
              {{ t('dashboard.greeting', { name: auth.user?.nama_lengkap?.split(' ')[0] }) }}
            </h1>
            <p class="mt-1 text-sm text-slate-500">
              <i18n-t keypath="dashboard.instructor.teachingSummary" tag="span" scope="global">
                <template #courses><b class="text-slate-700">{{ fmtAngka(num('jumlah_kursus')) }}</b></template>
                <template #students><b class="text-slate-700">{{ fmtAngka(num('jumlah_siswa')) }}</b></template>
              </i18n-t>
            </p>
          </div>
          <RouterLink to="/d/kursus/tambah" class="btn-primary shrink-0">
            <Icon name="plus" :size="16" /> {{ t('nav.header.newCourse') }}
          </RouterLink>
        </div>
        <Icon name="book-open" :size="150" class="absolute -end-6 -top-6 rotate-12 text-brand-100" />
      </section>

      <!-- KPI -->
      <section>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :icon="k.icon" :accent="k.accent" />
        </div>
        <div v-if="payoutPending > 0" class="card mt-4 flex items-center justify-between border-amber-200 bg-amber-50/60 p-4">
          <div class="flex items-center gap-3 text-sm text-amber-700">
            <Icon name="credit-card" :size="18" />
            <i18n-t keypath="dashboard.instructor.payoutPending" tag="span" scope="global">
              <template #n><b>{{ fmtAngka(payoutPending) }}</b></template>
            </i18n-t>
          </div>
          <RouterLink to="/d/transaksi" class="text-sm font-medium text-amber-700 hover:underline">
            {{ t('dashboard.instructor.check') }}
          </RouterLink>
        </div>
      </section>

      <!-- Kursus saya -->
      <section>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">
            <i18n-t keypath="dashboard.instructor.myCourses" tag="span" scope="global">
              <template #highlight><span class="font-bold">{{ t('dashboard.instructor.coursesWord') }}</span></template>
            </i18n-t>
          </h2>
          <RouterLink to="/d/kursus" class="section-link">{{ t('dashboard.instructor.manageAll') }}</RouterLink>
        </div>
        <div v-if="kursusSaya.length" class="space-y-3">
          <div v-for="(c, i) in kursusSaya" :key="c.id" class="card flex items-center gap-4 p-4 transition hover:shadow-md">
            <div class="grid h-14 w-14 shrink-0 place-items-center rounded bg-gradient-to-br text-white" :class="thumbClass(i)">
              <Icon name="play-circle" :size="24" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="truncate card-title">{{ c.judul }}</h3>
                <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusChip[c.status_publikasi] ?? 'bg-slate-100 text-slate-500'">
                  {{ statusLabel(c.status_publikasi) }}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-400">
                <span class="flex items-center gap-1">
                  <Icon name="users" :size="12" />
                  {{ fmtAngka(c.jumlah_siswa ?? 0) }} {{ t('common.unit.student', Number(c.jumlah_siswa ?? 0)) }}
                </span>
                <span class="text-accent-500">★ <span class="num">{{ Number(c.rating_avg ?? 0).toFixed(1) }}</span></span>
                <span>{{ fmtHarga(c.harga) }}</span>
              </div>
            </div>
            <RouterLink :to="`/d/kursus/${c.id}`" class="btn-outline btn-sm shrink-0">
              {{ t('dashboard.instructor.manage') }}
            </RouterLink>
          </div>
        </div>
        <div v-else class="empty-state">
          {{ t('dashboard.instructor.noCourses') }}
          <RouterLink to="/d/kursus/tambah" class="mt-1 block font-medium text-brand-500 hover:text-brand-600">
            {{ t('dashboard.instructor.createFirst') }}
          </RouterLink>
        </div>
      </section>
    </div>

    <!-- Rail kanan -->
    <div class="space-y-6">
      <!-- Pendaftaran terbaru -->
      <div class="card p-5">
        <h3 class="mb-3 flex items-center gap-2 card-title">
          <Icon name="users" :size="16" class="text-brand-500" /> {{ t('dashboard.instructor.recentEnrollments') }}
        </h3>
        <ul v-if="enrollmentTerbaru.length" class="space-y-3">
          <li v-for="e in enrollmentTerbaru" :key="e.id" class="flex items-start gap-3">
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-500">
              {{ initialsOf(e.user_nama) }}
            </span>
            <div class="min-w-0">
              <div class="text-sm text-slate-700"><b>{{ e.user_nama }}</b> {{ t('dashboard.instructor.enrolledVerb') }}</div>
              <div class="line-clamp-1 text-xs text-slate-400">{{ e.course_judul }} · {{ fmtRelatif(e.created_at) }}</div>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-400">{{ t('dashboard.instructor.noEnrollments') }}</p>
        <RouterLink to="/d/enrollment" class="section-link mt-3 block text-end">{{ t('dashboard.student.seeAll') }}</RouterLink>
      </div>

      <!-- Live class -->
      <div class="card p-5">
        <h3 class="mb-3 flex items-center gap-2 card-title">
          <Icon name="video" :size="16" class="text-brand-500" /> {{ t('dashboard.student.upcomingLive') }}
        </h3>
        <ul v-if="jadwalLive.length" class="space-y-3">
          <li v-for="j in jadwalLive" :key="j.id" class="flex items-start gap-2">
            <span class="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-500"></span>
            <div class="min-w-0">
              <div class="line-clamp-1 text-sm text-slate-700">{{ j.judul }}</div>
              <div class="text-xs text-slate-400">{{ fmtTanggal(j.waktu_mulai) }}</div>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-400">{{ t('dashboard.student.noLive') }}</p>
        <RouterLink to="/d/live-class" class="section-link mt-3 block text-end">{{ t('dashboard.instructor.manageSchedule') }}</RouterLink>
      </div>

      <!-- Shortcut -->
      <div class="card p-5">
        <h3 class="mb-3 card-title">{{ t('dashboard.instructor.quickActions') }}</h3>
        <div class="space-y-2">
          <RouterLink to="/d/konten" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="layers" :size="16" /> {{ t('dashboard.instructor.quickCurriculum') }}
          </RouterLink>
          <RouterLink to="/d/asesmen" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="check-square" :size="16" /> {{ t('dashboard.instructor.quickQuiz') }}
          </RouterLink>
          <RouterLink to="/d/grading" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="grid" :size="16" /> {{ t('dashboard.instructor.quickGrading') }}
          </RouterLink>
          <RouterLink to="/d/diskusi" class="nav-item rounded border-0 px-3 py-2">
            <Icon name="message-circle" :size="16" /> {{ t('dashboard.instructor.quickDiscussion') }}
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
