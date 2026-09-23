<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, assetUrl } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import Icon from '@/components/ui/Icon.vue';

const { t } = useI18n();

interface Instruktur {
  id: string;
  nama_lengkap: string;
  foto_profil: string | null;
  bio: string | null;
  keahlian: string[] | null;
  rating_avg: string;
  rating_count: number;
  total_siswa: number;
  jumlah_kursus: number;
  sosial_media?: Record<string, string> | null;
}

const instructors = ref<Instruktur[]>([]);
const loading = ref(true);

const SOSMED = [
  { key: 'facebook', icon: 'facebook' },
  { key: 'instagram', icon: 'instagram' },
  { key: 'x', icon: 'twitter' },
  { key: 'youtube', icon: 'youtube' },
  { key: 'linkedin', icon: 'linkedin' },
];

onMounted(async () => {
  const res = await apiGetFull<Instruktur[]>('/instructors/public', { limit: 48 }).catch(() => null);
  instructors.value = res?.data ?? [];
  loading.value = false;
});
</script>

<template>
  <div>
    <!-- Breadcrumb hero -->
    <section class="bg-gradient-to-r from-brand-50 via-white to-sky-50">
      <div class="mx-auto max-w-7xl px-4 py-12 text-center">
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{{ t('catalog.instructors.title') }}</h1>
        <nav class="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
          <RouterLink to="/" class="transition hover:text-brand-500">{{ t('nav.public.home') }}</RouterLink>
          <span class="h-1 w-4 rounded bg-brand-400"></span>
          <span class="text-slate-700">{{ t('nav.public.instructors') }}</span>
        </nav>
        <p class="mx-auto mt-3 max-w-xl text-sm text-slate-500">{{ t('catalog.instructors.subtitle') }}</p>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 py-12">
      <div v-if="loading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="i in 8" :key="i" class="card h-72 animate-pulse rounded-xl bg-slate-100"></div>
      </div>

      <div v-else-if="instructors.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="ins in instructors" :key="ins.id" class="card group flex flex-col items-center rounded-xl p-6 text-center transition hover:-translate-y-1 hover:shadow-lg">
          <RouterLink :to="`/instruktur/${ins.id}`" class="relative">
            <span class="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-100 text-3xl font-bold text-brand-600">
              <img v-if="ins.foto_profil" :src="assetUrl(ins.foto_profil)" :alt="ins.nama_lengkap" class="h-full w-full object-cover" />
              <template v-else>{{ ins.nama_lengkap[0] }}</template>
            </span>
            <span class="absolute bottom-1 end-1 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
              <Icon name="check" :size="12" />
            </span>
          </RouterLink>
          <RouterLink :to="`/instruktur/${ins.id}`" class="mt-4 font-bold text-slate-900 group-hover:text-brand-500">{{ ins.nama_lengkap }}</RouterLink>
          <p class="mt-0.5 text-xs text-slate-400">
            {{ (ins.keahlian ?? []).slice(0, 2).join(' · ') || t('catalog.instructors.defaultRole') }}
          </p>
          <div class="mt-2 flex items-center gap-1 text-xs">
            <Icon name="star" :size="13" class="fill-accent-400 text-accent-400" />
            <span class="num font-semibold text-slate-700">{{ Number(ins.rating_avg).toFixed(1) }}</span>
            <span class="num text-slate-400">({{ fmtAngka(ins.rating_count) }})</span>
          </div>
          <div class="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>{{ t('catalog.instructors.coursesCount', { n: fmtAngka(ins.jumlah_kursus) }) }}</span>
            <span>{{ t('catalog.instructors.studentsCount', { n: fmtAngka(ins.total_siswa) }) }}</span>
          </div>
          <div v-if="ins.sosial_media" class="mt-3 flex gap-2">
            <template v-for="s in SOSMED" :key="s.key">
              <a
                v-if="ins.sosial_media[s.key]"
                :href="ins.sosial_media[s.key]"
                target="_blank"
                rel="noopener"
                :aria-label="s.key"
                class="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-brand-500 hover:text-white"
              >
                <Icon :name="s.icon" :size="13" />
              </a>
            </template>
          </div>
        </div>
      </div>

      <p v-else class="card rounded-xl p-14 text-center text-slate-400">{{ t('catalog.instructors.empty') }}</p>
    </div>
  </div>
</template>
