<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import Icon from '@/components/ui/Icon.vue';
import CourseCard from '@/components/ui/CourseCard.vue';

const { t } = useI18n();

interface Course {
  id: string;
  slug: string;
  judul: string;
  harga: number;
  harga_coret?: number | null;
  level?: string;
  category_nama?: string;
  category_slug?: string;
  instructor_nama?: string;
  instructor_foto?: string | null;
  rating_avg?: string | number | null;
  rating_count?: number;
  jumlah_siswa?: number;
  meta?: { thumbnail_url?: string } | null;
}
interface Kategori { id: string; nama: string; slug: string; jumlah_kursus: number }

const route = useRoute();
// Komponen dipakai di dua tempat: katalog publik (/kursus) dan dalam dashboard (/d/katalog).
const inDashboard = computed(() => route.path.startsWith('/d'));
const detailBase = computed(() => (inDashboard.value ? '/d/katalog' : '/kursus'));

const courses = ref<Course[]>([]);
const categories = ref<Kategori[]>([]);
const loading = ref(true);
const total = ref(0);
const page = ref(1);
const limit = 9;

// ── Filter ──
const q = ref((route.query.q as string) || '');
const kategori = ref((route.query.kategori as string) || '');
const level = ref('');
const harga = ref<'semua' | 'gratis' | 'berbayar'>('semua');
const sort = ref('-published_at'); // Terbaru dulu

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const rentang = computed(() => {
  if (!total.value) return t('catalog.list.noResults');
  const awal = (page.value - 1) * limit + 1;
  const akhir = Math.min(page.value * limit, total.value);
  return t('catalog.list.range', { from: fmtAngka(awal), to: fmtAngka(akhir), total: fmtAngka(total.value) });
});

const adaFilter = computed(() => !!(q.value || kategori.value || level.value || harga.value !== 'semua'));

// Nilai (`v`) tetap kode BE; hanya labelnya yang diterjemahkan.
const LEVELS = computed(() => [
  { v: '', t: t('catalog.list.allLevels') },
  { v: 'pemula', t: t('common.level.pemula') },
  { v: 'menengah', t: t('common.level.menengah') },
  { v: 'mahir', t: t('common.level.mahir') },
]);
const HARGA = computed(() => [
  { v: 'semua', t: t('catalog.list.priceAll') },
  { v: 'gratis', t: t('catalog.list.priceFree') },
  { v: 'berbayar', t: t('catalog.list.pricePaid') },
]);

async function load() {
  loading.value = true;
  try {
    const res = await apiGetFull<Course[]>('/courses/public', {
      q: q.value || undefined,
      'filter[kategori]': kategori.value || undefined,
      'filter[level]': level.value || undefined,
      'filter[harga_min]': harga.value === 'berbayar' ? 1 : undefined,
      'filter[harga_max]': harga.value === 'gratis' ? 0 : undefined,
      sort: sort.value,
      page: page.value,
      limit,
    });
    courses.value = res.data ?? [];
    total.value = Number((res.meta as Record<string, unknown> | null)?.total ?? courses.value.length);
  } catch {
    courses.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function terapkan() {
  page.value = 1;
  load();
}
function bersihkan() {
  q.value = '';
  kategori.value = '';
  level.value = '';
  harga.value = 'semua';
  terapkan();
}

watch([kategori, level, harga, sort], terapkan);
watch(page, load);
// Sinkron dengan query dari header/landing (mis. /kursus?q=…&kategori=…).
watch(
  () => route.query,
  (nq) => {
    const nQ = (nq.q as string) || '';
    const nKat = (nq.kategori as string) || '';
    if (nQ !== q.value || nKat !== kategori.value) {
      q.value = nQ;
      kategori.value = nKat;
      terapkan();
    }
  },
);

onMounted(async () => {
  load();
  const cat = await apiGetFull<Kategori[]>('/categories/public').catch(() => null);
  categories.value = (cat?.data ?? []).filter((k) => k.jumlah_kursus > 0);
});
</script>

<template>
  <div>
    <!-- Breadcrumb hero (hanya publik) -->
    <section v-if="!inDashboard" class="bg-gradient-to-r from-brand-50 via-white to-sky-50">
      <div class="mx-auto max-w-7xl px-4 py-12 text-center">
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{{ t('catalog.list.title') }}</h1>
        <nav class="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
          <RouterLink to="/" class="transition hover:text-brand-500">{{ t('nav.public.home') }}</RouterLink>
          <span class="h-1 w-4 rounded bg-brand-400"></span>
          <span class="text-slate-700">{{ t('catalog.list.title') }}</span>
        </nav>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 py-8" :class="inDashboard ? '' : 'lg:py-10'">
      <div class="grid gap-8 lg:grid-cols-[16rem,1fr]">
        <!-- ── Sidebar filter ─────────────────────────────────────── -->
        <aside class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 font-semibold text-slate-800">
              <Icon name="filter" :size="16" /> {{ t('catalog.list.filter') }}
            </span>
            <button v-if="adaFilter" class="text-xs font-medium text-brand-500 underline" @click="bersihkan">
              {{ t('catalog.list.clear') }}
            </button>
          </div>

          <div class="card rounded-xl p-4">
            <h3 class="text-sm font-semibold text-slate-800">{{ t('catalog.list.category') }}</h3>
            <div class="mt-3 space-y-2">
              <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input v-model="kategori" type="radio" value="" class="accent-brand-500" /> {{ t('catalog.list.allCategories') }}
              </label>
              <label v-for="k in categories" :key="k.id" class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input v-model="kategori" type="radio" :value="k.slug" class="accent-brand-500" />
                <span class="flex-1">{{ k.nama }}</span>
                <span class="text-xs text-slate-400">({{ k.jumlah_kursus }})</span>
              </label>
            </div>
          </div>

          <div class="card rounded-xl p-4">
            <h3 class="text-sm font-semibold text-slate-800">{{ t('catalog.list.level') }}</h3>
            <div class="mt-3 space-y-2">
              <label v-for="l in LEVELS" :key="l.v" class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input v-model="level" type="radio" :value="l.v" class="accent-brand-500" /> {{ l.t }}
              </label>
            </div>
          </div>

          <div class="card rounded-xl p-4">
            <h3 class="text-sm font-semibold text-slate-800">{{ t('catalog.list.price') }}</h3>
            <div class="mt-3 space-y-2">
              <label v-for="h in HARGA" :key="h.v" class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input v-model="harga" type="radio" :value="h.v" class="accent-brand-500" /> {{ h.t }}
              </label>
            </div>
          </div>
        </aside>

        <!-- ── Hasil ──────────────────────────────────────────────── -->
        <div>
          <div class="mb-5 flex flex-wrap items-center gap-3">
            <p class="text-sm text-slate-500">{{ rentang }}</p>
            <div class="ms-auto flex flex-wrap items-center gap-2">
              <select v-model="sort" class="input w-auto rounded-full py-2 text-sm">
                <option value="-published_at">{{ t('catalog.list.sortNewest') }}</option>
                <option value="harga">{{ t('catalog.list.sortPriceAsc') }}</option>
                <option value="-harga">{{ t('catalog.list.sortPriceDesc') }}</option>
                <option value="judul">{{ t('catalog.list.sortTitle') }}</option>
              </select>
              <div class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2">
                <Icon name="search" :size="14" class="text-slate-400" />
                <input
                  v-model="q"
                  class="w-40 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  :placeholder="t('common.placeholder.search')"
                  @keyup.enter="terapkan"
                />
              </div>
            </div>
          </div>

          <div v-if="loading" class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <div v-for="i in 6" :key="i" class="card h-80 animate-pulse rounded-xl bg-slate-100"></div>
          </div>
          <div v-else-if="courses.length" class="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <CourseCard v-for="c in courses" :key="c.id" :course="c" :base="detailBase" />
          </div>
          <div v-else class="card rounded-xl p-14 text-center text-slate-400">
            {{ t('catalog.list.emptyFilter') }}
            <button class="mt-2 block w-full text-sm font-medium text-brand-500 underline" @click="bersihkan">
              {{ t('catalog.list.clearFilter') }}
            </button>
          </div>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="mt-8 flex items-center justify-center gap-2">
            <button class="btn-outline rounded-full px-4 py-2 text-xs" :disabled="page <= 1" @click="page--">
              {{ t('catalog.list.prev') }}
            </button>
            <button
              v-for="p in totalPages"
              :key="p"
              class="grid h-9 w-9 place-items-center rounded-full text-sm font-medium transition"
              :class="p === page ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50'"
              @click="page = p"
            >
              {{ p }}
            </button>
            <button class="btn-outline rounded-full px-4 py-2 text-xs" :disabled="page >= totalPages" @click="page++">
              {{ t('catalog.list.next') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
