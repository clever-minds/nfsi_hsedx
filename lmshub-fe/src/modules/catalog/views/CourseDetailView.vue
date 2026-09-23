<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, assetUrl, errorMessage } from '@/lib/api';
import { fmtAngka, fmtDurasiMenit, fmtHarga } from '@/lib/format';
import { levelLabel } from '@/lib/labels';
import { useAuthStore } from '@/stores/auth';
import { useCheckout } from '@/composables/useCheckout';
import { getPaymentConfig, type GatewayOption } from '@/lib/payments';
import Icon from '@/components/ui/Icon.vue';

interface Lesson { id: string; judul: string; tipe: string; durasi_menit?: number | null; gratis_preview?: boolean }
interface Section { id: string; judul: string; lessons?: Lesson[] }
interface CourseDetail {
  id: string;
  judul: string;
  ringkasan?: string;
  deskripsi?: string | null;
  harga: number;
  harga_coret?: number | null;
  level?: string;
  bahasa?: string;
  category_nama?: string;
  durasi_total_menit?: number;
  rating_avg?: string | number;
  rating_count?: number;
  jumlah_siswa?: number;
  instructor_id?: string;
  instructor_nama?: string;
  instructor_foto?: string | null;
  instructor_bio?: string | null;
  instructor_keahlian?: string[] | null;
  instructor_rating?: string | null;
  instructor_rating_count?: number | null;
  instructor_total_siswa?: number | null;
  instructor_jumlah_kursus?: number | null;
  meta?: {
    thumbnail_url?: string;
    yang_dipelajari?: string[];
    persyaratan?: string[];
    cocok_untuk?: string[];
  } | null;
  kurikulum?: Section[];
}
/** Satu rekening tujuan transfer manual (master data `bank_accounts`). */
interface BankAccountOption {
  id: string;
  bank: string;
  nomor_rekening: string;
  atas_nama: string;
  cabang?: string | null;
  is_utama?: boolean;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const course = ref<CourseDetail | null>(null);
const error = ref('');
const { loading: buying, error: buyError, status, buy } = useCheckout();

const showMethodPanel = ref(false);
const gateways = ref<GatewayOption[]>([]);
const gatewayLoading = ref(false);
const showTransferPanel = ref(false);
const bankAccounts = ref<BankAccountOption[]>([]);
/** Rekening yang sedang dipilih pembeli — awalnya rekening utama. */
const selectedBankId = ref<string>('');
const bankConfig = computed<BankAccountOption | null>(
  () => bankAccounts.value.find((b) => b.id === selectedBankId.value) ?? bankAccounts.value[0] ?? null,
);
const bankConfigLoading = ref(false);
const bankConfigError = ref('');
const referensi = ref('');
const transferSukses = ref(false);

// Bila sudah ter-enroll, tombol beli diganti "Mulai Belajar".
const enrolled = ref(false);

// Akordeon kurikulum: seksi pertama terbuka.
const openSections = ref<Set<string>>(new Set());
function toggleSection(id: string) {
  if (openSections.value.has(id)) openSections.value.delete(id);
  else openSections.value.add(id);
  openSections.value = new Set(openSections.value);
}

const totalLesson = computed(() => (course.value?.kurikulum ?? []).reduce((a, s) => a + (s.lessons?.length ?? 0), 0));
const totalJam = computed(() => fmtDurasiMenit(course.value?.durasi_total_menit ?? 0));
const diskon = computed(() => {
  const h = Number(course.value?.harga ?? 0);
  const c = Number(course.value?.harga_coret ?? 0);
  return c > h && h > 0 ? Math.round(((c - h) / c) * 100) : 0;
});
const inisialInstruktur = computed(() =>
  (course.value?.instructor_nama ?? '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
);
const bintang = computed(() => Math.round(Number(course.value?.rating_avg ?? 0)));

onMounted(async () => {
  try {
    course.value = await apiGet<CourseDetail>(`/courses/public/${route.params.slug}`);
    if (course.value?.kurikulum?.[0]) openSections.value = new Set([course.value.kurikulum[0].id]);
    if (auth.isAuthenticated && course.value) {
      const { apiGetFull } = await import('@/lib/api');
      const res = await apiGetFull<Array<{ course_id: string; status: string }>>('/enrollments', {
        'filter[course_id]': course.value.id,
      }).catch(() => null);
      enrolled.value = !!res?.data?.some(
        (e) => e.course_id === course.value!.id && ['terdaftar', 'aktif', 'selesai'].includes(e.status),
      );
    }
  } catch (e) {
    error.value = errorMessage(e, t('catalog.detail.notFound'));
  }
});

async function openMethodPanel() {
  buyError.value = '';

  // Kursus gratis tidak punya apa pun untuk dipilih. Menawarkan daftar metode
  // pembayaran untuk tagihan nol hanya membingungkan, dan jalur gateway-nya
  // memang menolak order bernilai nol.
  if (Number(course.value?.harga ?? 0) === 0) {
    const ok = await buy([{ item_tipe: 'kursus', course_id: course.value!.id }]);
    if (ok) {
      enrolled.value = true;
      router.push('/d/belajar');
    }
    return;
  }

  showMethodPanel.value = true;

  // Gateway yang ditawarkan ditentukan server: hanya yang punya kredensial DAN
  // mendukung mata uang toko. Jangan pernah menebaknya di klien.
  if (!gateways.value.length) {
    gatewayLoading.value = true;
    try {
      gateways.value = (await getPaymentConfig()).providers;
    } catch {
      // Daftar kosong: pembeli masih bisa memakai transfer bank manual.
      gateways.value = [];
    } finally {
      gatewayLoading.value = false;
    }
  }
}
function closeMethodPanel() {
  showMethodPanel.value = false;
}

async function bayarGateway(providerId: string) {
  if (!course.value) return;
  const ok = await buy([{ item_tipe: 'kursus', course_id: course.value.id }], { metode: providerId });
  // Gateway hosted mengalihkan browser; tidak ada yang perlu dilakukan di sini.
  if (ok && status.value === 'sukses') {
    showMethodPanel.value = false;
    router.push('/d/belajar');
  }
}

async function openTransferPanel() {
  if (!course.value) return;
  showMethodPanel.value = false;
  showTransferPanel.value = true;
  transferSukses.value = false;
  referensi.value = '';
  if (!bankAccounts.value.length) {
    bankConfigLoading.value = true;
    bankConfigError.value = '';
    try {
      const cfg = await apiGet<{
        bank_accounts?: BankAccountOption[];
        bank_transfer: Omit<BankAccountOption, 'id'> | null;
      }>('/orders/payment-config');
      // `bank_accounts` adalah bentuk baru; `bank_transfer` dipertahankan backend
      // sebagai satu rekening untuk klien lama, jadi dipakai sebagai cadangan.
      const daftar = cfg.bank_accounts?.length
        ? cfg.bank_accounts
        : cfg.bank_transfer
          ? [{ id: 'default', ...cfg.bank_transfer }]
          : [];
      bankAccounts.value = daftar;
      selectedBankId.value = (daftar.find((b) => b.is_utama) ?? daftar[0])?.id ?? '';
      if (!daftar.length) bankConfigError.value = t('catalog.detail.pay.noBankAccount');
    } catch (e) {
      bankConfigError.value = errorMessage(e, t('catalog.detail.pay.loadBankFailed'));
    } finally {
      bankConfigLoading.value = false;
    }
  }
}
function closeTransferPanel() {
  showTransferPanel.value = false;
}

async function beliTransfer() {
  if (!course.value) return;
  const ok = await buy([{ item_tipe: 'kursus', course_id: course.value.id }], {
    metode: 'transfer',
    referensi: referensi.value,
  });
  if (ok) transferSukses.value = true;
}

async function bagikan() {
  try {
    if (navigator.share) await navigator.share({ title: course.value?.judul, url: location.href });
    else {
      await navigator.clipboard.writeText(location.href);
      alert(t('catalog.detail.linkCopied'));
    }
  } catch {
    /* dibatalkan pengguna */
  }
}

const TERMASUK = computed(() => [
  { icon: 'play-circle', teks: t('catalog.detail.inc.video', { duration: totalJam.value }) },
  { icon: 'file-text', teks: t('catalog.detail.inc.lessons', { n: fmtAngka(totalLesson.value) }) },
  { icon: 'clock', teks: t('catalog.detail.inc.lifetime') },
  { icon: 'smartphone', teks: t('catalog.detail.inc.devices') },
  { icon: 'check-square', teks: t('catalog.detail.inc.quiz') },
  { icon: 'award', teks: t('catalog.detail.inc.certificate') },
]);
</script>

<template>
  <div>
    <!-- Breadcrumb hero -->
    <section class="bg-gradient-to-r from-brand-50 via-white to-sky-50">
      <div class="mx-auto max-w-7xl px-4 py-10 text-center">
        <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{{ t('catalog.detail.title') }}</h1>
        <nav class="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
          <RouterLink to="/" class="transition hover:text-brand-500">{{ t('nav.public.home') }}</RouterLink>
          <span class="h-1 w-4 rounded bg-brand-400"></span>
          <RouterLink to="/kursus" class="transition hover:text-brand-500">{{ t('nav.public.courses') }}</RouterLink>
          <span class="h-1 w-4 rounded bg-brand-400"></span>
          <span class="max-w-[14rem] truncate text-slate-700">{{ course?.judul || '…' }}</span>
        </nav>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 py-8">
      <p v-if="error" class="card rounded-xl p-10 text-center text-slate-400">{{ error }}</p>

      <template v-else-if="course">
        <!-- ── Kartu header kursus ─────────────────────────────────── -->
        <div class="card grid gap-6 rounded-2xl p-5 md:grid-cols-[minmax(0,22rem),1fr] md:p-6">
          <div class="relative overflow-hidden rounded-xl">
            <img
              v-if="course.meta?.thumbnail_url"
              :src="assetUrl(course.meta.thumbnail_url)"
              :alt="course.judul"
              class="h-52 w-full object-cover md:h-full"
            />
            <div v-else class="grid h-52 place-items-center bg-gradient-to-br from-brand-400 to-brand-600 md:h-full">
              <Icon name="play-circle" :size="52" class="text-white/80" />
            </div>
            <span class="absolute inset-0 grid place-items-center">
              <span class="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-brand-500 shadow-lg transition hover:scale-105">
                <Icon name="play-circle" :size="30" />
              </span>
            </span>
          </div>

          <div class="flex flex-col">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <h2 class="max-w-2xl text-2xl font-extrabold leading-snug text-slate-900">{{ course.judul }}</h2>
              <span v-if="course.category_nama" class="rounded-full bg-accent-400 px-3 py-1 text-xs font-bold text-white">
                {{ course.category_nama }}
              </span>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{{ course.ringkasan }}</p>

            <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
              <span class="flex items-center gap-1.5">
                <Icon name="book-open" :size="15" class="text-brand-500" />
                {{ t('catalog.detail.lessonsPlus', { n: fmtAngka(totalLesson) }) }}
              </span>
              <span class="flex items-center gap-1.5"><Icon name="clock" :size="15" class="text-accent-500" /> {{ totalJam }}</span>
              <span class="flex items-center gap-1.5">
                <Icon name="users" :size="15" class="text-emerald-500" />
                {{ t('catalog.detail.studentsEnrolled', { n: fmtAngka(course.jumlah_siswa ?? 0) }) }}
              </span>
              <span class="flex items-center gap-1.5">
                <Icon name="bar-chart" :size="15" class="text-sky-500" />
                {{ t('catalog.detail.levelPrefix', { level: levelLabel(course.level) }) }}
              </span>
            </div>

            <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <RouterLink :to="course.instructor_id ? `/instruktur/${course.instructor_id}` : '#'" class="group flex items-center gap-3">
                <span class="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-brand-100 text-sm font-bold text-brand-600">
                  <img v-if="course.instructor_foto" :src="assetUrl(course.instructor_foto)" :alt="course.instructor_nama" class="h-full w-full object-cover" />
                  <template v-else>{{ inisialInstruktur }}</template>
                </span>
                <span>
                  <span class="block text-sm font-semibold text-slate-900 group-hover:text-brand-500">{{ course.instructor_nama }}</span>
                  <span class="block text-xs text-slate-400">{{ t('catalog.detail.instructor') }}</span>
                </span>
              </RouterLink>
              <span class="flex items-center gap-1.5">
                <span class="flex">
                  <Icon v-for="i in 5" :key="i" name="star" :size="15" :class="i <= bintang ? 'fill-accent-400 text-accent-400' : 'text-slate-300'" />
                </span>
                <span class="num text-sm font-semibold text-slate-700">{{ Number(course.rating_avg ?? 0).toFixed(1) }}</span>
                <span class="num text-xs text-slate-400">({{ fmtAngka(course.rating_count ?? 0) }})</span>
              </span>
            </div>
          </div>
        </div>

        <!-- ── Konten + sidebar ────────────────────────────────────── -->
        <div class="mt-8 grid gap-8 lg:grid-cols-[1fr,20rem]">
          <div class="min-w-0 space-y-6">
            <!-- Overview -->
            <div class="card rounded-2xl p-6">
              <h3 class="text-lg font-bold text-slate-900">{{ t('catalog.detail.overview') }}</h3>
              <h4 class="mt-4 text-sm font-semibold text-slate-800">{{ t('catalog.detail.description') }}</h4>
              <div class="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">
                <p v-for="(par, i) in (course.deskripsi || course.ringkasan || '').split('\n\n')" :key="i">{{ par }}</p>
              </div>

              <template v-if="course.meta?.yang_dipelajari?.length">
                <h4 class="mt-6 text-sm font-semibold text-slate-800">{{ t('catalog.detail.whatYouLearn') }}</h4>
                <ul class="mt-2 grid gap-2 sm:grid-cols-2">
                  <li v-for="(y, i) in course.meta.yang_dipelajari" :key="i" class="flex items-start gap-2 text-sm text-slate-600">
                    <Icon name="check" :size="15" class="mt-0.5 shrink-0 text-emerald-500" /> {{ y }}
                  </li>
                </ul>
              </template>

              <template v-if="course.meta?.persyaratan?.length">
                <h4 class="mt-6 text-sm font-semibold text-slate-800">{{ t('catalog.detail.requirements') }}</h4>
                <ul class="mt-2 space-y-1.5">
                  <li v-for="(p, i) in course.meta.persyaratan" :key="i" class="flex items-start gap-2 text-sm text-slate-600">
                    <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"></span> {{ p }}
                  </li>
                </ul>
              </template>

              <template v-if="course.meta?.cocok_untuk?.length">
                <h4 class="mt-6 text-sm font-semibold text-slate-800">{{ t('catalog.detail.suitableFor') }}</h4>
                <ul class="mt-2 space-y-1.5">
                  <li v-for="(c2, i) in course.meta.cocok_untuk" :key="i" class="flex items-start gap-2 text-sm text-slate-600">
                    <Icon name="target" :size="15" class="mt-0.5 shrink-0 text-sky-500" /> {{ c2 }}
                  </li>
                </ul>
              </template>
            </div>

            <!-- Konten kursus (akordeon) -->
            <div class="card rounded-2xl p-6">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-lg font-bold text-slate-900">{{ t('catalog.detail.courseContent') }}</h3>
                <span class="text-sm text-slate-500">
                  {{ t('catalog.detail.lessonsCount', { n: fmtAngka(totalLesson) }) }} ·
                  <span class="font-semibold text-brand-500">{{ totalJam }}</span>
                </span>
              </div>
              <div class="mt-4 space-y-3">
                <div v-for="s in course.kurikulum || []" :key="s.id" class="overflow-hidden rounded-xl border border-slate-200">
                  <button
                    class="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-3.5 text-start text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                    @click="toggleSection(s.id)"
                  >
                    {{ s.judul }}
                    <Icon name="chevron-down" :size="16" class="shrink-0 text-slate-400 transition-transform" :class="openSections.has(s.id) ? 'rotate-180' : ''" />
                  </button>
                  <div v-if="openSections.has(s.id)" class="divide-y divide-slate-100">
                    <div v-for="l in s.lessons || []" :key="l.id" class="flex items-center gap-3 px-4 py-3 text-sm">
                      <Icon name="play-circle" :size="16" class="shrink-0 text-brand-400" />
                      <span class="min-w-0 flex-1 truncate text-slate-700">{{ l.judul }}</span>
                      <span v-if="l.gratis_preview" class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                        {{ t('catalog.detail.preview') }}
                      </span>
                      <span v-if="l.durasi_menit" class="shrink-0 text-xs text-slate-400">
                        {{ fmtAngka(l.durasi_menit) }} {{ t('catalog.detail.minShort') }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tentang instruktur -->
            <div class="card rounded-2xl p-6">
              <h3 class="text-lg font-bold text-slate-900">{{ t('catalog.detail.aboutInstructor') }}</h3>
              <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                <RouterLink :to="course.instructor_id ? `/instruktur/${course.instructor_id}` : '#'" class="group flex items-center gap-3">
                  <span class="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-brand-100 text-lg font-bold text-brand-600">
                    <img v-if="course.instructor_foto" :src="assetUrl(course.instructor_foto)" :alt="course.instructor_nama" class="h-full w-full object-cover" />
                    <template v-else>{{ inisialInstruktur }}</template>
                  </span>
                  <span>
                    <span class="block font-bold text-slate-900 group-hover:text-brand-500">{{ course.instructor_nama }}</span>
                    <span class="block text-xs text-slate-400">
                      {{ (course.instructor_keahlian ?? []).slice(0, 3).join(' · ') || t('catalog.instructors.defaultRole') }}
                    </span>
                  </span>
                </RouterLink>
                <span class="flex items-center gap-1 text-sm">
                  <Icon name="star" :size="15" class="fill-accent-400 text-accent-400" />
                  <span class="num font-semibold text-slate-700">{{ Number(course.instructor_rating ?? 0).toFixed(1) }}</span>
                  <span class="text-xs text-slate-400">
                    ({{ t('catalog.instructors.reviewsCount', { n: fmtAngka(course.instructor_rating_count ?? 0) }) }})
                  </span>
                </span>
              </div>
              <div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-100 py-3 text-sm text-slate-600">
                <span class="flex items-center gap-1.5">
                  <Icon name="play-circle" :size="15" class="text-brand-500" />
                  {{ t('catalog.detail.instructorCourses', { n: fmtAngka(course.instructor_jumlah_kursus ?? 0) }) }}
                </span>
                <span class="flex items-center gap-1.5">
                  <Icon name="users" :size="15" class="text-emerald-500" />
                  {{ t('catalog.detail.instructorStudents', { n: fmtAngka(course.instructor_total_siswa ?? 0) }) }}
                </span>
              </div>
              <p class="mt-4 text-sm leading-relaxed text-slate-600">{{ course.instructor_bio || t('catalog.detail.defaultBio') }}</p>
              <div v-if="course.instructor_keahlian?.length" class="mt-4">
                <h4 class="text-sm font-semibold text-slate-800">{{ t('catalog.detail.expertise') }}</h4>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span v-for="k in course.instructor_keahlian" :key="k" class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{{ k }}</span>
                </div>
              </div>
              <RouterLink
                v-if="course.instructor_id"
                :to="`/instruktur/${course.instructor_id}`"
                class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
              >
                {{ t('catalog.detail.viewFullProfile') }} <Icon name="arrow-right" :size="13" class="rtl-flip" />
              </RouterLink>
            </div>
          </div>

          <!-- ── Sidebar ─────────────────────────────────────────────── -->
          <aside class="space-y-5">
            <div class="card sticky top-20 rounded-2xl p-5">
              <div class="flex items-baseline justify-between">
                <span class="text-3xl font-extrabold" :class="Number(course.harga) > 0 ? 'text-slate-900' : 'text-emerald-500'">
                  {{ fmtHarga(course.harga) }}
                </span>
                <span v-if="diskon" class="text-sm text-slate-400">
                  <span class="line-through">{{ fmtHarga(course.harga_coret!) }}</span> · {{ t('catalog.detail.off', { n: diskon }) }}
                </span>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-2">
                <button class="btn-outline justify-center rounded-full py-2 text-xs">
                  <Icon name="heart" :size="14" /> {{ t('catalog.detail.wishlist') }}
                </button>
                <button class="btn-outline justify-center rounded-full py-2 text-xs" @click="bagikan">
                  <Icon name="share-2" :size="14" /> {{ t('common.action.share') }}
                </button>
              </div>

              <template v-if="enrolled">
                <RouterLink :to="`/d/belajar/${course.id}`" class="btn-primary mt-3 block w-full rounded-full py-3 text-center">
                  {{ t('catalog.detail.startLearning') }}
                </RouterLink>
                <p class="mt-2 text-center text-xs text-emerald-600">{{ t('catalog.detail.alreadyEnrolled') }}</p>
              </template>
              <template v-else-if="auth.isAuthenticated">
                <button class="btn-primary mt-3 w-full rounded-full py-3" :disabled="buying" @click="openMethodPanel">
                  {{ buying ? t('catalog.detail.processing') : t('catalog.detail.enrollNow') }}
                </button>
                <p v-if="buyError" class="mt-2 text-xs text-rose-600">{{ buyError }}</p>
              </template>
              <RouterLink v-else to="/register" class="btn-primary mt-3 block w-full rounded-full py-3 text-center">
                {{ t('catalog.detail.registerAndStart') }}
              </RouterLink>

              <!-- Termasuk -->
              <div class="mt-6 border-t border-slate-100 pt-4">
                <h4 class="text-sm font-bold text-slate-900">{{ t('catalog.detail.included') }}</h4>
                <ul class="mt-3 space-y-2.5">
                  <li v-for="inc in TERMASUK" :key="inc.teks" class="flex items-center gap-2.5 text-sm text-slate-600">
                    <Icon :name="inc.icon" :size="15" class="shrink-0 text-brand-400" /> {{ inc.teks }}
                  </li>
                </ul>
              </div>
            </div>

            <!-- Fitur kursus -->
            <div class="card rounded-2xl p-5">
              <h4 class="text-sm font-bold text-slate-900">{{ t('catalog.detail.features') }}</h4>
              <ul class="mt-3 space-y-2.5 text-sm text-slate-600">
                <li class="flex items-center gap-2.5">
                  <Icon name="users" :size="15" class="shrink-0 text-indigo-500" />
                  {{ t('catalog.detail.feat.enrolled', { n: fmtAngka(course.jumlah_siswa ?? 0) }) }}
                </li>
                <li class="flex items-center gap-2.5">
                  <Icon name="clock" :size="15" class="shrink-0 text-accent-500" />
                  {{ t('catalog.detail.feat.duration', { value: totalJam }) }}
                </li>
                <li class="flex items-center gap-2.5">
                  <Icon name="layers" :size="15" class="shrink-0 text-sky-500" />
                  {{ t('catalog.detail.feat.chapters', { n: fmtAngka((course.kurikulum ?? []).length) }) }}
                </li>
                <li class="flex items-center gap-2.5">
                  <Icon name="play-circle" :size="15" class="shrink-0 text-brand-500" />
                  {{ t('catalog.detail.feat.video', { n: fmtAngka(totalLesson) }) }}
                </li>
                <li class="flex items-center gap-2.5">
                  <Icon name="bar-chart" :size="15" class="shrink-0 text-emerald-500" />
                  {{ t('catalog.detail.feat.level', { value: levelLabel(course.level) }) }}
                </li>
                <li class="flex items-center gap-2.5">
                  <Icon name="globe" :size="15" class="shrink-0 text-slate-400" />
                  {{ t('catalog.detail.feat.language', { value: (course.bahasa || 'ID').toUpperCase() }) }}
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </template>

      <!-- skeleton -->
      <div v-else class="card h-72 animate-pulse rounded-2xl bg-slate-100"></div>
    </div>

    <!-- Panel pemilihan metode pembayaran -->
    <div v-if="showMethodPanel" class="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
      <div class="card w-full max-w-md rounded-2xl p-5">
        <h3 class="text-lg font-bold text-slate-900">{{ t('catalog.detail.pay.title') }}</h3>
        <p class="mt-1 text-sm text-slate-500">
          {{ course?.judul }} — {{ course ? fmtHarga(course.harga) : '' }}
        </p>
        <div v-if="buyError" class="mt-3 alert-error">{{ buyError }}</div>
        <div class="mt-4 space-y-3">
          <p v-if="gatewayLoading" class="text-sm text-slate-400">{{ t('catalog.detail.pay.loadingMethods') }}</p>

          <button
            v-for="(g, i) in gateways"
            :key="g.id"
            :class="i === 0 ? 'btn-primary' : 'btn-outline'"
            class="w-full rounded-full"
            :disabled="buying"
            @click="bayarGateway(g.id)"
          >
            {{ buying ? t('catalog.detail.processing') : t('catalog.detail.pay.payWith', { gateway: g.label }) }}
          </button>

          <button class="btn-outline w-full rounded-full" :disabled="buying" @click="openTransferPanel">
            {{ t('catalog.detail.pay.transfer') }}
          </button>
        </div>
        <button class="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600" @click="closeMethodPanel">
          {{ t('common.action.cancel') }}
        </button>
      </div>
    </div>

    <!-- Panel transfer bank manual -->
    <div v-if="showTransferPanel" class="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
      <div class="card w-full max-w-md rounded-2xl p-5">
        <h3 class="text-lg font-bold text-slate-900">{{ t('catalog.detail.pay.transferTitle') }}</h3>

        <template v-if="transferSukses">
          <div class="mt-3 alert-success">
            {{ t('catalog.detail.pay.success') }}
          </div>
          <button class="btn-primary mt-4 w-full rounded-full" @click="closeTransferPanel">{{ t('common.action.close') }}</button>
        </template>
        <template v-else>
          <div v-if="bankConfigLoading" class="mt-3 text-sm text-slate-400">{{ t('catalog.detail.pay.loadingBank') }}</div>
          <div v-else-if="bankConfigError" class="mt-3 alert-error">{{ bankConfigError }}</div>
          <template v-else-if="bankConfig">
            <!-- Lebih dari satu rekening aktif: biarkan pembeli memilih tujuan transfer. -->
            <div v-if="bankAccounts.length > 1" class="mt-3">
              <label class="label">{{ t('catalog.detail.pay.chooseAccount') }}</label>
              <select v-model="selectedBankId" class="input">
                <option v-for="b in bankAccounts" :key="b.id" :value="b.id">
                  {{ b.bank }} — {{ b.nomor_rekening }}
                </option>
              </select>
            </div>

            <div class="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
              <div class="flex justify-between">
                <span>{{ t('catalog.detail.pay.bank') }}</span>
                <span class="font-medium">{{ bankConfig.bank }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ t('catalog.detail.pay.accountNumber') }}</span>
                <span class="num font-medium">{{ bankConfig.nomor_rekening }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ t('catalog.detail.pay.accountName') }}</span>
                <span class="font-medium">{{ bankConfig.atas_nama }}</span>
              </div>
              <div v-if="bankConfig.cabang" class="flex justify-between">
                <span>{{ t('catalog.detail.pay.branch') }}</span>
                <span class="font-medium">{{ bankConfig.cabang }}</span>
              </div>
            </div>
          </template>
          <p class="mt-3 text-xs text-slate-500">
            {{ t('catalog.detail.pay.hint', { amount: course ? fmtHarga(course.harga) : '' }) }}
          </p>
          <div class="mt-3">
            <label class="label">{{ t('catalog.detail.pay.refLabel') }}</label>
            <input v-model="referensi" class="input" :placeholder="t('catalog.detail.pay.refPlaceholder')" />
          </div>
          <div v-if="buyError" class="mt-3 alert-error">{{ buyError }}</div>
          <div class="mt-4 flex gap-2">
            <button class="btn-outline w-full rounded-full" :disabled="buying" @click="closeTransferPanel">
              {{ t('common.action.cancel') }}
            </button>
            <button class="btn-primary w-full rounded-full" :disabled="buying" @click="beliTransfer">
              {{ buying ? t('catalog.detail.processing') : t('catalog.detail.pay.createOrder') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
