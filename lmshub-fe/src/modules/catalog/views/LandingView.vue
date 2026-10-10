<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull, assetUrl } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import { useSiteContentStore } from '@/stores/siteContent';
import { pickText } from '@/lib/site-content';
import Icon from '@/components/ui/Icon.vue';
import CourseCard from '@/components/ui/CourseCard.vue';

interface Course {
  id: string;
  slug: string;
  title: string;
  price: number;
  strike_price?: number | null;
  level?: string;
  category_name?: string;
  instructor_name?: string;
  instructor_foto?: string | null;
  rating_avg?: string | number | null;
  rating_count?: number;
  student_count?: number;
  meta?: { thumbnail_url?: string } | null;
}
interface Kategori { id: string; name: string; slug: string; ikon?: string | null; amount_kursus: number }
interface Instructor {
  id: string;
  name_lengkap: string;
  profile_picture: string | null;
  keahlian: string[] | null;
  rating_avg: string;
  rating_count: number;
  total_siswa: number;
  amount_kursus: number;
}

const router = useRouter();
const { t } = useI18n();
const site = useSiteContentStore();

/**
 * Teks & susunan halaman ini managed lewat menu Website di admin.
 *
 * Setiap pembacaan diberi text bawaan sebagai cadangan: field yang belum
 * pernah diisi tetap tampil dalam language pengunjung, bukan kosong.
 */
const hero = computed(() => site.hero);
const heroGambar = computed(() => assetUrl(site.hero.gambar_url));

/** Seksi active, sudah sort_order sesuai susunan yang disimpan admin. */
const sort_orderanSeksi = computed(() => site.sectionsAktif);

const badgeSeksi = (key: string, bawaan: string) => pickText(site.section(key)?.badge, bawaan);
const judulSeksi = (key: string, bawaan: string) => pickText(site.section(key)?.title, bawaan);
const subjudulSeksi = (key: string, bawaan: string) => pickText(site.section(key)?.subjudul, bawaan);
const courses = ref<Course[]>([]);
const categories = ref<Kategori[]>([]);
const instructors = ref<Instructor[]>([]);
const totalKursus = ref(0);

const q = ref('');
const categoryDipilih = ref('');

const totalSiswa = computed(() => instructors.value.reduce((a, i) => a + (i.total_siswa || 0), 0));

function search() {
  router.push({
    path: '/courses',
    query: { ...(q.value ? { q: q.value } : {}), ...(categoryDipilih.value ? { category: categoryDipilih.value } : {}) },
  });
}

// Kunci i18n, bukan text — supaya blok keunggulan ikut berganti language.
const BENEFIT = [
  { icon: 'users', key: 'expert' },
  { icon: 'award', key: 'certificate' },
  { icon: 'zap', key: 'pace' },
];

onMounted(async () => {
  const [c, cat, ins] = await Promise.all([
    apiGetFull<Course[]>('/courses/public', { limit: 8 }).catch(() => null),
    apiGetFull<Kategori[]>('/categories/public').catch(() => null),
    apiGetFull<Instructor[]>('/instructors/public', { limit: 4 }).catch(() => null),
  ]);
  courses.value = c?.data ?? [];
  totalKursus.value = Number((c?.meta as Record<string, unknown> | null)?.total ?? courses.value.length);
  categories.value = (cat?.data ?? []).filter((k) => k.amount_kursus > 0);
  instructors.value = ins?.data ?? [];
});
</script>

<template>
  <div>
    <!-- ── HERO ───────────────────────────────────────────────────── -->
    <section v-if="hero.active" class="relative overflow-hidden bg-white">
      <div class="pointster-events-none absolute -start-24 top-10 h-72 w-72 rounded-full bg-brand-100 blur-3xl"></div>
      <div class="pointster-events-none absolute -end-24 bottom-0 h-80 w-80 rounded-full bg-accent-400/20 blur-3xl"></div>

      <div class="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <span class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <Icon name="book-open" :size="14" class="text-brand-500" />
            {{ pickText(hero.badge, t('catalog.landing.hero.badge')) }}
          </span>
          <h1 class="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
            {{ pickText(hero.title_pre, t('catalog.landing.hero.titlePre')) }}
            <span class="relative inline-block whitespace-nowrap"
              ><span class="absolute inset-x-0 inset-y-1 -rotate-1 rounded-lg bg-brand-500"></span
              ><span class="relative px-2 text-white">{{
                pickText(hero.title_highlight, t('catalog.landing.hero.titleHighlight'))
              }}</span></span
            >
            {{ pickText(hero.title_post, t('catalog.landing.hero.titlePost')) }}
          </h1>
          <p class="mt-5 max-w-lg text-slate-500">{{ pickText(hero.subjudul, t('catalog.landing.hero.subtitle')) }}</p>

          <!-- Search besar -->
          <div
            v-if="hero.tampilkan_pencarian"
            class="mt-8 flex max-w-xl items-center gap-1 rounded-full bg-white p-1.5 shadow-lg ring-1 ring-slate-200"
          >
            <div class="hidden shrink-0 items-center gap-1.5 border-e border-slate-200 px-4 sm:flex">
              <Icon name="grid" :size="14" class="text-slate-400" />
              <select v-model="categoryDipilih" class="max-w-[9rem] bg-transparent text-sm text-slate-600 outline-none">
                <option value="">{{ t('catalog.landing.hero.allCategories') }}</option>
                <option v-for="k in categories" :key="k.id" :value="k.slug">{{ k.name }}</option>
              </select>
            </div>
            <input
              v-model="q"
              type="search"
              :placeholder="t('catalog.landing.hero.searchPlaceholder')"
              class="w-full bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-slate-400"
              @keyup.enter="search"
            />
            <button class="shrink-0 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-brand-500" @click="search">
              {{ t('catalog.landing.hero.searchBtn') }}
            </button>
          </div>

          <div v-if="hero.tampilkan_rating" class="mt-6 flex items-center gap-2 text-sm">
            <span class="flex text-accent-400">
              <Icon v-for="i in 5" :key="i" name="star" :size="15" class="fill-accent-400" />
            </span>
            <span class="num font-semibold text-slate-800">
              {{ hero.rating_score || t('catalog.landing.hero.ratingScore') }}
            </span>
            <span class="text-slate-400">{{ pickText(hero.rating_teks, t('catalog.landing.hero.ratingSuffix')) }}</span>
          </div>
        </div>

        <!-- Panel kanan: kartu statistik mengambang -->
        <div class="relative hidden lg:block">
          <img
            v-if="heroGambar"
            :src="heroGambar"
            alt=""
            class="mx-auto h-96 w-96 rounded-[3rem] object-cover shadow-xl"
          />
          <div
            v-else
            class="mx-auto h-96 w-96 rounded-[3rem] bg-gradient-to-br from-brand-500 via-brand-400 to-accent-400 opacity-90"
          ></div>
          <div
            v-if="hero.tampilkan_kartu_siswa"
            class="absolute start-0 top-8 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-xl"
          >
            <div class="flex -space-x-2">
              <span
                v-for="(ins, i) in instructors.slice(0, 3)"
                :key="i"
                class="grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 border-white bg-brand-100 text-xs font-bold text-brand-600"
              >
                <img v-if="ins.profile_picture" :src="assetUrl(ins.profile_picture)" :alt="ins.name_lengkap" class="h-full w-full object-cover" />
                <template v-else>{{ ins.name_lengkap[0] }}</template>
              </span>
            </div>
            <div>
              <div class="text-sm font-bold text-slate-900">{{ fmtAngka(totalSiswa) }}+</div>
              <div class="text-xs text-slate-400">{{ t('catalog.landing.float.students') }}</div>
            </div>
          </div>
          <div
            v-if="hero.tampilkan_kartu_kursus"
            class="absolute bottom-10 end-0 flex items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-xl"
          >
            <span class="grid h-10 w-10 place-items-center rounded-xl bg-brand-500"><Icon name="book-open" :size="18" /></span>
            <div>
              <div class="text-sm font-bold">{{ t('catalog.landing.float.coursesCount', { n: fmtAngka(totalKursus) }) }}</div>
              <div class="text-xs text-slate-400">{{ t('catalog.landing.float.readyToLearn') }}</div>
            </div>
          </div>
          <div class="absolute end-8 top-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-400 text-white shadow-lg">
            <Icon name="zap" :size="20" />
          </div>
        </div>
      </div>
    </section>

    <!-- Urutan & tampil-sembunyi seksi berikut diatur di menu Website (admin). -->
    <template v-for="s in sort_orderanSeksi" :key="s.key">
      <!-- ── KATEGORI TERATAS ───────────────────────────────────────── -->
      <section v-if="s.key === 'category'" class="mx-auto max-w-7xl px-4 py-16">
        <div class="text-center">
          <span class="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-xs font-semibold text-brand-500">
            {{ badgeSeksi('category', t('catalog.landing.categories.badge')) }}
          </span>
          <h2 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{{ judulSeksi('category', t('catalog.landing.categories.title')) }}</h2>
          <p class="mx-auto mt-2 max-w-xl text-sm text-slate-500">{{ subjudulSeksi('category', t('catalog.landing.categories.subtitle')) }}</p>
        </div>
        <div class="mt-10 flex flex-wrap justify-center">
          <div v-for="k in categories" :key="k.id" class="w-1/2 p-2 sm:w-1/3 lg:w-1/6">
            <RouterLink
              :to="{ path: '/courses', query: { category: k.slug } }"
              class="card group flex h-full flex-col items-center gap-3 rounded-xl p-6 text-center transition hover:-translate-y-1 hover:shadow-lg"
            >
              <span class="grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 text-2xl transition group-hover:bg-brand-50">{{ k.ikon || '📚' }}</span>
              <div>
                <div class="text-sm font-semibold text-slate-800 group-hover:text-brand-500">{{ k.name }}</div>
                <div class="mt-0.5 text-xs text-slate-400">{{ t('catalog.landing.categories.count', { n: fmtAngka(k.amount_kursus) }) }}</div>
              </div>
            </RouterLink>
          </div>
        </div>
      </section>

      <!-- ── BENEFIT (gelap) ────────────────────────────────────────── -->
      <section v-else-if="s.key === 'benefit'" class="bg-slate-900 py-16 text-white">
        <div class="mx-auto max-w-7xl px-4 text-center">
          <span class="inline-block rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold">{{ badgeSeksi('benefit', t('catalog.landing.benefits.badge')) }}</span>
          <h2 class="mt-3 text-3xl font-extrabold tracking-tight">{{ judulSeksi('benefit', t('catalog.landing.benefits.title')) }}</h2>
          <p class="mx-auto mt-2 max-w-xl text-sm text-slate-400">{{ subjudulSeksi('benefit', t('catalog.landing.benefits.subtitle')) }}</p>
          <div class="mt-12 grid gap-10 md:grid-cols-3">
            <div v-for="b in BENEFIT" :key="b.key" class="flex flex-col items-center">
              <span class="grid h-16 w-16 place-items-center rounded-full bg-white/10 transition hover:bg-brand-500">
                <Icon :name="b.icon" :size="26" />
              </span>
              <h3 class="mt-5 text-lg font-bold">{{ t(`catalog.landing.benefits.${b.key}.title`) }}</h3>
              <p class="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{{ t(`catalog.landing.benefits.${b.key}.text`) }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── course UNGGULAN ────────────────────────────────────────── -->
      <section v-else-if="s.key === 'featured'" class="mx-auto max-w-7xl px-4 py-16">
        <div class="text-center">
          <span class="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-xs font-semibold text-brand-500">
            {{ badgeSeksi('featured', t('catalog.landing.featured.badge')) }}
          </span>
          <h2 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{{ judulSeksi('featured', t('catalog.landing.featured.title')) }}</h2>
          <p class="mx-auto mt-2 max-w-xl text-sm text-slate-500">{{ subjudulSeksi('featured', t('catalog.landing.featured.subtitle')) }}</p>
        </div>
        <div v-if="courses.length" class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <CourseCard v-for="c in courses" :key="c.id" :course="c" />
        </div>
        <p v-else class="mt-10 text-center text-slate-400">{{ t('catalog.landing.featured.empty') }}</p>
        <div class="mt-10 text-center">
          <RouterLink to="/courses" class="inline-flex items-center gap-2 rounded-full bg-slate-900 px-7 py-3 text-sm font-medium text-white transition hover:bg-brand-500">
            {{ t('catalog.landing.featured.seeAll') }} <Icon name="arrow-right" :size="15" class="rtl-flip" />
          </RouterLink>
        </div>
      </section>

      <!-- ── STATISTIK (kartu gelap) ────────────────────────────────── -->
      <section v-else-if="s.key === 'stats'" class="mx-auto max-w-7xl px-4">
        <div class="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-12 text-white">
          <Icon name="zap" :size="28" class="absolute start-8 top-8 text-accent-400" />
          <div class="text-center">
            <h2 class="text-2xl font-extrabold tracking-tight sm:text-3xl">{{ judulSeksi('stats', t('catalog.landing.stats.title')) }}</h2>
            <p class="mt-2 text-sm text-slate-400">{{ subjudulSeksi('stats', t('catalog.landing.stats.subtitle')) }}</p>
          </div>
          <div class="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-8 text-center md:grid-cols-3">
            <div>
              <div class="text-3xl font-extrabold sm:text-4xl">{{ fmtAngka(totalSiswa) }}</div>
              <div class="mt-1 text-xs text-slate-400">{{ t('catalog.landing.stats.students') }}</div>
            </div>
            <div class="md:border-s md:border-white/10">
              <div class="text-3xl font-extrabold sm:text-4xl">{{ fmtAngka(totalKursus) }}</div>
              <div class="mt-1 text-xs text-slate-400">{{ t('catalog.landing.stats.courses') }}</div>
            </div>
            <div class="md:border-s md:border-white/10">
              <div class="text-3xl font-extrabold sm:text-4xl">{{ fmtAngka(categories.length) }}</div>
              <div class="mt-1 text-xs text-slate-400">{{ t('catalog.landing.stats.categories') }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── INSTRUKTUR TERBAIK ─────────────────────────────────────── -->
      <section v-else-if="s.key === 'instructor'" class="mx-auto max-w-7xl px-4 py-16">
        <div class="text-center">
          <span class="inline-block rounded-full bg-brand-50 px-4 py-1.5 text-xs font-semibold text-brand-500">
            {{ badgeSeksi('instructor', t('catalog.landing.instructors.badge')) }}
          </span>
          <h2 class="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">{{ judulSeksi('instructor', t('catalog.landing.instructors.title')) }}</h2>
          <p class="mx-auto mt-2 max-w-xl text-sm text-slate-500">{{ subjudulSeksi('instructor', t('catalog.landing.instructors.subtitle')) }}</p>
        </div>
        <div v-if="instructors.length" class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <RouterLink
            v-for="ins in instructors"
            :key="ins.id"
            :to="`/instructors/${ins.id}`"
            class="card group flex flex-col items-center rounded-xl p-6 text-center transition hover:-translate-y-1 hover:shadow-lg"
          >
            <span class="relative">
              <span class="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-100 text-3xl font-bold text-brand-600">
                <img v-if="ins.profile_picture" :src="assetUrl(ins.profile_picture)" :alt="ins.name_lengkap" class="h-full w-full object-cover" />
                <template v-else>{{ ins.name_lengkap[0] }}</template>
              </span>
              <span class="absolute bottom-1 end-1 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                <Icon name="check" :size="12" />
              </span>
            </span>
            <h3 class="mt-4 font-bold text-slate-900 group-hover:text-brand-500">{{ ins.name_lengkap }}</h3>
            <p class="mt-0.5 text-xs text-slate-400">
              {{ (ins.keahlian ?? []).slice(0, 2).join(' · ') || t('catalog.instructors.defaultRole') }}
            </p>
            <div class="mt-2 flex items-center gap-1 text-xs">
              <Icon name="star" :size="13" class="fill-accent-400 text-accent-400" />
              <span class="num font-semibold text-slate-700">{{ Number(ins.rating_avg).toFixed(1) }}</span>
              <span class="text-slate-400">({{ t('catalog.instructors.reviewsCount', { n: fmtAngka(ins.rating_count) }) }})</span>
            </div>
            <div class="mt-3 flex gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>{{ t('catalog.instructors.coursesCount', { n: fmtAngka(ins.amount_kursus) }) }}</span>
              <span>{{ t('catalog.instructors.studentsCount', { n: fmtAngka(ins.total_siswa) }) }}</span>
            </div>
          </RouterLink>
        </div>
        <div class="mt-8 text-center">
          <RouterLink to="/instructors" class="text-sm font-medium text-brand-500 hover:underline">
            {{ t('catalog.landing.instructors.seeAll') }}
          </RouterLink>
        </div>
      </section>

      <!-- ── CTA register ─────────────────────────────────────────────── -->
      <section v-else-if="s.key === 'cta'" class="mx-auto max-w-7xl px-4 pb-4">
        <div class="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-14 text-white">
          <div class="pointster-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-brand-500/30 blur-3xl"></div>
          <div class="relative max-w-xl">
            <h2 class="text-3xl font-extrabold tracking-tight">{{ judulSeksi('cta', t('catalog.landing.cta.title')) }}</h2>
            <p class="mt-3 text-sm text-slate-400">{{ subjudulSeksi('cta', t('catalog.landing.cta.subtitle')) }}</p>
            <div class="mt-6 flex flex-wrap gap-3">
              <RouterLink to="/register" class="btn-primary rounded-full px-7 py-3">{{ t('catalog.landing.cta.register') }}</RouterLink>
              <RouterLink to="/courses" class="rounded-full border border-white/20 px-7 py-3 text-sm font-medium transition hover:border-brand-400 hover:text-brand-400">
                {{ t('catalog.landing.cta.browse') }}
              </RouterLink>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
