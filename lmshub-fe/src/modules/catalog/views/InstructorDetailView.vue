<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, assetUrl, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import Icon from '@/components/ui/Icon.vue';

const { t } = useI18n();
import CourseCard from '@/components/ui/CourseCard.vue';

interface Kursus {
  id: string;
  slug: string;
  judul: string;
  harga: number;
  level: string;
  rating_avg: string;
  rating_count: number;
  jumlah_siswa: number;
  category_nama: string;
  meta?: { thumbnail_url?: string } | null;
}
interface InstrukturDetail {
  id: string;
  nama_lengkap: string;
  foto_profil: string | null;
  bio: string | null;
  keahlian: string[] | null;
  sosial_media: Record<string, string> | null;
  rating_avg: string;
  rating_count: number;
  total_siswa: number;
  jumlah_kursus: number;
  kursus: Kursus[];
}

const route = useRoute();
const instruktur = ref<InstrukturDetail | null>(null);
const error = ref('');

const SOSMED = [
  { key: 'facebook', icon: 'facebook', label: 'Facebook' },
  { key: 'instagram', icon: 'instagram', label: 'Instagram' },
  { key: 'x', icon: 'twitter', label: 'Twitter/X' },
  { key: 'youtube', icon: 'youtube', label: 'YouTube' },
  { key: 'linkedin', icon: 'linkedin', label: 'LinkedIn' },
  { key: 'website', icon: 'globe', label: 'Website' },
];

onMounted(async () => {
  try {
    instruktur.value = await apiGet<InstrukturDetail>(`/instructors/public/${route.params.id}`);
  } catch (e) {
    error.value = errorMessage(e, t('catalog.instructors.notFound'));
  }
});
</script>

<template>
  <div>
    <p v-if="error" class="mx-auto max-w-3xl px-4 py-16 text-center text-slate-400">{{ error }}</p>

    <template v-else-if="instruktur">
      <!-- ── Header profil ──────────────────────────────────────────── -->
      <section class="bg-slate-900 text-white">
        <div class="mx-auto max-w-7xl px-4 py-14">
          <div class="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-start">
            <span class="relative shrink-0">
              <span class="grid h-32 w-32 place-items-center overflow-hidden rounded-full bg-brand-500/20 text-4xl font-bold text-brand-300 ring-4 ring-white/10">
                <img v-if="instruktur.foto_profil" :src="assetUrl(instruktur.foto_profil)" :alt="instruktur.nama_lengkap" class="h-full w-full object-cover" />
                <template v-else>{{ instruktur.nama_lengkap[0] }}</template>
              </span>
              <span class="absolute bottom-2 end-2 grid h-7 w-7 place-items-center rounded-full bg-emerald-500 ring-2 ring-slate-900">
                <Icon name="check" :size="13" />
              </span>
            </span>

            <div class="min-w-0 flex-1">
              <h1 class="text-3xl font-extrabold tracking-tight">{{ instruktur.nama_lengkap }}</h1>
              <p class="mt-1 text-sm text-slate-300">
                {{ (instruktur.keahlian ?? []).slice(0, 3).join(' · ') || t('catalog.instructors.defaultRole') }}
              </p>

              <div class="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm sm:justify-start">
                <span class="flex items-center gap-1.5">
                  <Icon name="star" :size="15" class="fill-accent-400 text-accent-400" />
                  <span class="num font-semibold">{{ Number(instruktur.rating_avg).toFixed(1) }}</span>
                  <span class="text-slate-400">({{ t('catalog.instructors.reviewsCount', { n: fmtAngka(instruktur.rating_count) }) }})</span>
                </span>
                <span class="flex items-center gap-1.5">
                  <Icon name="play-circle" :size="15" class="text-brand-400" />
                  {{ t('catalog.detail.instructorCourses', { n: fmtAngka(instruktur.jumlah_kursus) }) }}
                </span>
                <span class="flex items-center gap-1.5">
                  <Icon name="users" :size="15" class="text-emerald-400" />
                  {{ t('catalog.instructors.studentsCount', { n: fmtAngka(instruktur.total_siswa) }) }}
                </span>
              </div>

              <div v-if="instruktur.sosial_media" class="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <template v-for="s in SOSMED" :key="s.key">
                  <a
                    v-if="instruktur.sosial_media[s.key]"
                    :href="instruktur.sosial_media[s.key]"
                    target="_blank"
                    rel="noopener"
                    :aria-label="s.label"
                    class="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-brand-500"
                  >
                    <Icon :name="s.icon" :size="15" />
                  </a>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="mx-auto max-w-7xl px-4 py-10">
        <div class="grid gap-8 lg:grid-cols-[1fr,18rem]">
          <!-- Bio + kursus -->
          <div class="min-w-0 space-y-8">
            <div class="card rounded-2xl p-6">
              <h2 class="text-lg font-bold text-slate-900">{{ t('catalog.instructors.about') }}</h2>
              <p class="mt-3 text-sm leading-relaxed text-slate-600">{{ instruktur.bio || t('catalog.detail.defaultBio') }}</p>
              <div v-if="instruktur.keahlian?.length" class="mt-5">
                <h3 class="text-sm font-semibold text-slate-800">{{ t('catalog.instructors.expertise') }}</h3>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span v-for="k in instruktur.keahlian" :key="k" class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{{ k }}</span>
                </div>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-bold text-slate-900">
                  {{ t('catalog.instructors.coursesBy', { name: instruktur.nama_lengkap.split(' ')[0] }) }}
                </h2>
                <span class="text-sm text-slate-400">{{ t('catalog.instructors.coursesCount', { n: fmtAngka(instruktur.kursus.length) }) }}</span>
              </div>
              <div v-if="instruktur.kursus.length" class="mt-5 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <CourseCard v-for="c in instruktur.kursus" :key="c.id" :course="c" />
              </div>
              <p v-else class="card mt-5 rounded-xl p-10 text-center text-slate-400">{{ t('catalog.instructors.noCourses') }}</p>
            </div>
          </div>

          <!-- Statistik ringkas -->
          <aside>
            <div class="card sticky top-20 space-y-4 rounded-2xl p-6">
              <h3 class="text-sm font-bold text-slate-900">{{ t('catalog.instructors.stats') }}</h3>
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-500"><Icon name="play-circle" :size="18" /></span>
                <div>
                  <div class="text-lg font-bold text-slate-900">{{ fmtAngka(instruktur.jumlah_kursus) }}</div>
                  <div class="text-xs text-slate-400">{{ t('catalog.instructors.totalCourses') }}</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-500"><Icon name="users" :size="18" /></span>
                <div>
                  <div class="text-lg font-bold text-slate-900">{{ fmtAngka(instruktur.total_siswa) }}</div>
                  <div class="text-xs text-slate-400">{{ t('catalog.instructors.enrolledStudents') }}</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 place-items-center rounded-xl bg-accent-400/15 text-accent-500"><Icon name="star" :size="18" /></span>
                <div>
                  <div class="num text-lg font-bold text-slate-900">{{ Number(instruktur.rating_avg).toFixed(1) }}</div>
                  <div class="text-xs text-slate-400">{{ t('catalog.instructors.ratingFrom', { n: fmtAngka(instruktur.rating_count) }) }}</div>
                </div>
              </div>
              <RouterLink to="/kursus" class="btn-outline mt-2 w-full justify-center rounded-full py-2.5 text-sm">
                {{ t('catalog.instructors.browseAll') }}
              </RouterLink>
            </div>
          </aside>
        </div>
      </div>
    </template>

    <div v-else class="mx-auto max-w-7xl px-4 py-16">
      <div class="card h-56 animate-pulse rounded-2xl bg-slate-100"></div>
    </div>
  </div>
</template>
