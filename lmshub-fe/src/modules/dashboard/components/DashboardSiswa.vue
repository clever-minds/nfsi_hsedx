<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { apiGet, apiGetFull, assetUrl } from '@/lib/api';
import { fmtAngka, fmtHarga, fmtPersen, fmtTanggal, initialsOf } from '@/lib/format';
import { kpiLabel, levelLabel, roleLabel } from '@/lib/labels';
import KpiCard from '@/components/ui/KpiCard.vue';
import Icon from '@/components/ui/Icon.vue';

interface Reminder { id: string; judul: string; jatuh_tempo: string; sumber?: string }
interface JadwalLive { id: string; judul: string; waktu_mulai: string; status?: string }

const props = defineProps<{ data: Record<string, unknown> }>();

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();

const kpiIcons: Record<string, string> = {
  kursus_aktif: 'play-circle',
  kursus_selesai: 'check-square',
  sertifikat_diraih: 'award',
  notifikasi_belum_dibaca: 'bell',
};

const kpis = computed(() =>
  Object.entries(props.data)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .slice(0, 4)
    .map(([k, v]) => ({ label: kpiLabel(k), value: fmtAngka(v as number | string), icon: kpiIcons[k] ?? 'bar-chart' })),
);
const reminders = computed(() => (props.data.reminder_mendatang as Reminder[] | undefined) ?? []);
const jadwalLive = computed(() => (props.data.jadwal_live_terdekat as JadwalLive[] | undefined) ?? []);

// ── Data tambahan (kursus saya, kategori, populer) ──────
// `kursus_judul`, bukan `course_judul`: nama kolom itu yang dikembalikan
// GET /enrollments. Endpoint agregasi dashboard memakai `course_judul`, jadi
// dua komponen dashboard lain memang benar membaca nama yang berbeda.
interface Enrollment { id: string; course_id: string; kursus_judul: string; status: string }
interface MyCourse extends Enrollment { progress_percent: number }
interface Category { id: string; nama: string; slug: string; ikon?: string | null }
interface PublicCourse {
  id: string; judul: string; slug: string; harga: number; level?: string;
  category_nama?: string; instructor_nama?: string; rating_avg?: string | number | null; jumlah_siswa?: number;
}

const myCourses = ref<MyCourse[]>([]);
const categories = ref<Category[]>([]);
const popularCourses = ref<PublicCourse[]>([]);
const searchQ = ref('');

const pastels = ['bg-orange-50', 'bg-sky-50', 'bg-emerald-50', 'bg-violet-50', 'bg-rose-50', 'bg-amber-50'];
const pastel = (i: number) => pastels[i % pastels.length];
const thumbGradients = [
  'from-brand-400 to-brand-600',
  'from-slate-600 to-slate-800',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
];
const thumbClass = (i: number) => thumbGradients[i % thumbGradients.length];

const initials = computed(() => initialsOf(auth.user?.nama_lengkap));

function searchCatalog() {
  router.push({ path: '/d/katalog', query: searchQ.value ? { q: searchQ.value } : {} });
}

onMounted(async () => {
  const enrolls = await apiGetFull<Enrollment[]>('/enrollments', { limit: 4 }).then((r) => r.data ?? []).catch(() => []);
  myCourses.value = await Promise.all(
    enrolls
      .filter((e) => ['terdaftar', 'aktif', 'selesai'].includes(e.status))
      .slice(0, 4)
      .map(async (e) => {
        const persen = await apiGet<{ persen_selesai: string }>(`/courses/${e.course_id}/progress`)
          .then((p) => Number(p.persen_selesai))
          .catch(() => 0);
        return { ...e, progress_percent: persen };
      }),
  );
  categories.value = (await apiGetFull<Category[]>('/categories/public').then((r) => r.data ?? []).catch(() => [])).slice(0, 8);
  popularCourses.value = (
    await apiGetFull<PublicCourse[]>('/courses/public', { limit: 8 }).then((r) => r.data ?? []).catch(() => [])
  ).slice(0, 8);
});
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[1fr,20rem]">
    <!-- Kolom utama -->
    <div class="min-w-0 space-y-8">
      <!-- Hero -->
      <section class="relative overflow-hidden rounded-lg bg-gradient-to-r from-sky-100 to-sky-50 p-6 sm:p-10">
        <div class="relative z-10 max-w-lg">
          <h1 class="text-2xl font-black leading-tight text-slate-900 sm:text-3xl">
            {{ t('dashboard.greeting', { name: auth.user?.nama_lengkap?.split(' ')[0] }) }}<br />
            <i18n-t keypath="dashboard.student.heroTitle" tag="span" scope="global">
              <template #highlight><span class="text-brand-500">{{ t('dashboard.student.heroHighlight') }}</span></template>
            </i18n-t>
          </h1>
          <p class="mt-2 text-sm text-slate-500">{{ t('dashboard.student.heroSubtitle') }}</p>
          <div class="mt-5 flex overflow-hidden rounded bg-white shadow-card">
            <span class="grid w-11 shrink-0 place-items-center text-slate-400"><Icon name="search" :size="17" /></span>
            <input
              v-model="searchQ"
              class="w-full py-3 pe-2 text-sm outline-none placeholder:text-slate-400"
              :placeholder="t('dashboard.student.searchPlaceholder')"
              @keyup.enter="searchCatalog"
            />
            <button class="shrink-0 bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600" @click="searchCatalog">
              {{ t('catalog.landing.hero.searchBtn') }}
            </button>
          </div>
        </div>
        <Icon name="play-circle" :size="180" class="absolute -end-8 -top-8 rotate-12 text-sky-200/70" />
      </section>

      <!-- KPI -->
      <section v-if="kpis.length">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :icon="k.icon" />
        </div>
      </section>

      <!-- Lanjutkan belajar -->
      <section>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">{{ t('dashboard.student.continueLearning') }}</h2>
          <RouterLink to="/d/belajar" class="section-link">{{ t('common.action.seeAll') }}</RouterLink>
        </div>
        <div v-if="myCourses.length" class="space-y-3">
          <div v-for="(c, i) in myCourses" :key="c.id" class="card flex items-center gap-4 p-4 transition hover:shadow-md">
            <div class="grid h-14 w-14 shrink-0 place-items-center rounded bg-gradient-to-br text-white" :class="thumbClass(i)">
              <Icon name="play-circle" :size="24" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="truncate card-title">{{ c.kursus_judul }}</h3>
              <div class="mt-2 flex items-center gap-3">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    class="h-full rounded-full"
                    :class="c.progress_percent >= 100 ? 'bg-emerald-500' : 'bg-brand-500'"
                    :style="{ width: `${Math.min(100, c.progress_percent)}%` }"
                  ></div>
                </div>
                <span class="shrink-0 text-xs font-medium text-slate-500">{{ fmtPersen(c.progress_percent) }}</span>
              </div>
            </div>
            <RouterLink :to="`/d/belajar/${c.course_id}`" class="btn-primary btn-sm shrink-0">
              {{
                c.progress_percent >= 100
                  ? t('dashboard.student.review')
                  : c.progress_percent > 0
                    ? t('dashboard.student.resume')
                    : t('dashboard.student.start')
              }}
            </RouterLink>
          </div>
        </div>
        <div v-else class="empty-state">
          {{ t('dashboard.student.noEnrollments') }}
          <RouterLink to="/d/katalog" class="mt-1 block font-medium text-brand-500 hover:text-brand-600">
            {{ t('dashboard.student.browseCatalog') }}
          </RouterLink>
        </div>
      </section>

      <!-- Kategori -->
      <section v-if="categories.length">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">
            {{ t('dashboard.student.explore') }} <span class="font-bold">{{ t('dashboard.student.categories') }}</span>
          </h2>
          <RouterLink to="/d/katalog" class="section-link">{{ t('common.action.seeAll') }}</RouterLink>
        </div>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <RouterLink
            v-for="(cat, i) in categories"
            :key="cat.id"
            :to="{ path: '/d/katalog', query: { kategori: cat.slug } }"
            class="rounded p-5 text-center transition hover:-translate-y-0.5 hover:shadow-md"
            :class="pastel(i)"
          >
            <span class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-brand-500 shadow-sm">
              <span v-if="cat.ikon" class="text-xl">{{ cat.ikon }}</span>
              <Icon v-else name="layers" :size="20" />
            </span>
            <div class="mt-3 truncate text-sm font-medium text-slate-800">{{ cat.nama }}</div>
          </RouterLink>
        </div>
      </section>

      <!-- Kursus populer -->
      <section v-if="popularCourses.length">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="section-title">
            {{ t('dashboard.student.coursesWord') }} <span class="font-bold">{{ t('dashboard.student.popular') }}</span>
          </h2>
          <RouterLink to="/d/katalog" class="section-link">{{ t('common.action.seeAll') }}</RouterLink>
        </div>
        <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="(c, i) in popularCourses.slice(0, 6)"
            :key="c.id"
            :to="`/d/katalog/${c.slug}`"
            class="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div class="relative grid h-32 place-items-center bg-gradient-to-br text-white/80" :class="thumbClass(i)">
              <Icon name="play-circle" :size="34" class="opacity-80 transition group-hover:scale-110" />
              <span v-if="c.level" class="absolute end-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">
                {{ levelLabel(c.level) }}
              </span>
            </div>
            <div class="p-4">
              <h3 class="line-clamp-2 text-sm font-medium leading-snug text-slate-900 group-hover:text-brand-500">{{ c.judul }}</h3>
              <div class="mt-1 truncate text-xs text-slate-400">
                {{ c.category_nama || t('dashboard.student.generalCategory') }}
                <template v-if="c.instructor_nama">· {{ c.instructor_nama }}</template>
              </div>
              <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span class="flex items-center gap-1 text-xs text-accent-500">
                  ★ <span class="num">{{ Number(c.rating_avg ?? 0).toFixed(1) }}</span>
                  <span class="num text-slate-300">({{ fmtAngka(c.jumlah_siswa ?? 0) }})</span>
                </span>
                <span class="font-bold text-slate-900">{{ fmtHarga(c.harga) }}</span>
              </div>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>

    <!-- Rail kanan -->
    <div class="space-y-6">
      <div class="card p-6 text-center">
        <div class="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-brand-500 text-2xl font-bold text-white ring-4 ring-brand-100">
          <img v-if="auth.user?.foto_profil" :src="assetUrl(auth.user.foto_profil)" :alt="auth.user?.nama_lengkap" class="h-full w-full object-cover" />
          <template v-else>{{ initials }}</template>
        </div>
        <h3 class="mt-3 font-medium text-slate-900">{{ auth.user?.nama_lengkap }}</h3>
        <p class="text-xs text-slate-400">{{ roleLabel(auth.activeRole) }}</p>
        <RouterLink to="/d/profil" class="btn-outline btn-sm mt-4 w-full">{{ t('dashboard.student.viewProfile') }}</RouterLink>
      </div>

      <div class="card p-5">
        <h3 class="mb-3 flex items-center gap-2 card-title">
          <Icon name="bell" :size="16" class="text-brand-500" /> {{ t('dashboard.student.reminders') }}
        </h3>
        <ul v-if="reminders.length" class="space-y-3">
          <li v-for="r in reminders" :key="r.id" class="border-s-2 border-brand-200 ps-3">
            <div class="line-clamp-1 text-sm text-slate-700">{{ r.judul }}</div>
            <div class="text-xs text-slate-400">{{ t('dashboard.student.dueOn', { date: fmtTanggal(r.jatuh_tempo) }) }}</div>
          </li>
        </ul>
        <p v-else class="text-sm text-slate-400">{{ t('dashboard.student.noReminders') }}</p>
      </div>

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
        <RouterLink to="/d/live-class" class="section-link mt-3 block text-end">{{ t('dashboard.student.seeAll') }}</RouterLink>
      </div>
    </div>
  </div>
</template>
