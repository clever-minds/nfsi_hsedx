<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import Icon from '@/components/ui/Icon.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import CurrencySwitcher from '@/components/ui/CurrencySwitcher.vue';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue';
import { useAppConfigStore } from '@/stores/appConfig';
import { useSiteContentStore } from '@/stores/siteContent';
import { pickText, safeHref } from '@/lib/site-content';

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();
const appConfig = useAppConfigStore();
const site = useSiteContentStore();
const mobileOpen = ref(false);
const q = ref('');

function cari() {
  router.push({ path: '/kursus', query: q.value ? { q: q.value } : {} });
  mobileOpen.value = false;
}

/** Menu bawaan; dipakai selama admin belum menyusun menunya sendiri. */
const NAV_BAWAAN = computed(() => [
  { label: t('nav.public.home'), to: '/' },
  { label: t('nav.public.courses'), to: '/kursus' },
  { label: t('nav.public.instructors'), to: '/instruktur' },
]);

const NAV = computed(() =>
  site.menuAktif.length
    ? site.menuAktif.map((m) => ({ label: pickText(m.label, m.url), to: safeHref(m.url) }))
    : NAV_BAWAAN.value,
);

/**
 * RouterLink hanya untuk path internal. Menu kustom boleh berisi alamat luar,
 * dan menyerahkannya ke router akan menghasilkan rute yang tidak cocok alih-alih
 * membuka tautannya.
 */
const internal = (url: string) => url.startsWith('/');

const alamat = computed(() => pickText(site.kontak.alamat));
const telepon = computed(() => site.kontak.telepon);
/** Topbar hanya berguna bila ada isinya — kosong lebih baik disembunyikan. */
const topbarTampil = computed(
  () => site.kontak.tampilkan_topbar && (!!alamat.value || !!telepon.value || site.sosialAktif.length > 0),
);

/** Kolom tautan footer; kosong berarti memakai dua kolom bawaan. */
const KOLOM_BAWAAN = computed(() => [
  {
    judul: t('nav.footer.explore'),
    tautan: [
      { label: t('nav.item.catalog'), url: '/kursus' },
      { label: t('nav.public.instructors'), url: '/instruktur' },
      { label: t('nav.footer.registerFree'), url: '/register' },
      { label: t('common.action.login'), url: '/login' },
    ],
  },
  {
    judul: t('nav.footer.support'),
    tautan: [
      { label: t('nav.footer.aboutUs'), url: '#' },
      { label: t('nav.footer.helpCenter'), url: '#' },
      { label: t('nav.footer.privacyPolicy'), url: '#' },
      { label: t('nav.footer.terms'), url: '#' },
    ],
  },
]);

const KOLOM = computed(() =>
  site.footer.kolom.length
    ? site.footer.kolom.map((k) => ({
        judul: pickText(k.judul),
        tautan: k.tautan.map((l) => ({ label: pickText(l.label, l.url), url: safeHref(l.url) })),
      }))
    : KOLOM_BAWAAN.value,
);

const tahun = new Date().getFullYear();

/**
 * Baris hak cipta, dengan tiga tingkat kemunduran: teks dari menu Website →
 * baris footer dari Pengaturan merek → teks bawaan aplikasi.
 */
const copyright = computed(() => {
  const dariSite = pickText(site.footer.copyright);
  if (dariSite) {
    return dariSite.split(':year').join(String(tahun)).split(':name').join(appConfig.appName);
  }
  return appConfig.footerText;
});
</script>

<template>
  <div class="min-h-screen bg-surface">
    <!-- ── Topbar gelap ala DreamsLMS ─────────────────────────────── -->
    <div v-if="topbarTampil" class="hidden bg-slate-900 text-xs text-slate-300 md:block">
      <div class="mx-auto flex h-9 max-w-7xl items-center gap-5 px-4">
        <span v-if="alamat" class="flex items-center gap-1.5"><Icon name="map-pin" :size="13" /> {{ alamat }}</span>
        <span v-if="telepon" class="flex items-center gap-1.5">
          <Icon name="phone" :size="13" /> <span class="num">{{ telepon }}</span>
        </span>
        <div class="ms-auto flex items-center gap-3">
          <CurrencySwitcher variant="dark" />
          <LocaleSwitcher variant="dark" />
          <a
            v-for="s in site.sosialAktif"
            :key="s.platform"
            :href="safeHref(s.url)"
            :aria-label="s.platform"
            target="_blank"
            rel="noopener"
            class="transition hover:text-white"
          >
            <Icon :name="s.platform" :size="13" />
          </a>
        </div>
      </div>
    </div>

    <!-- ── Header utama ───────────────────────────────────────────── -->
    <header class="sticky top-0 z-40 bg-white shadow-header">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <RouterLink to="/">
          <BrandMark />
        </RouterLink>

        <nav class="hidden items-center gap-6 text-sm font-medium lg:flex">
          <template v-for="(n, i) in NAV" :key="i">
            <RouterLink
              v-if="internal(n.to)"
              :to="n.to"
              class="text-slate-700 transition hover:text-brand-500"
              active-class="text-brand-500"
            >
              {{ n.label }}
            </RouterLink>
            <a v-else :href="n.to" class="text-slate-700 transition hover:text-brand-500">{{ n.label }}</a>
          </template>
        </nav>

        <div class="hidden max-w-sm flex-1 md:block">
          <div class="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition focus-within:border-brand-400 focus-within:bg-white">
            <Icon name="search" :size="15" class="shrink-0 text-slate-400" />
            <input
              v-model="q"
              type="search"
              :placeholder="t('nav.header.searchPublic')"
              class="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              @keyup.enter="cari"
            />
          </div>
        </div>

        <div class="ms-auto flex items-center gap-2">
          <!-- Pemilih bahasa juga di header agar terlihat di mobile (topbar tersembunyi) -->
          <CurrencySwitcher class="md:hidden" :show-label="false" />
          <LocaleSwitcher class="md:hidden" :show-label="false" />
          <template v-if="auth.isAuthenticated">
            <RouterLink to="/d" class="btn-primary rounded-full py-2">{{ t('nav.header.goToDashboard') }}</RouterLink>
          </template>
          <template v-else>
            <RouterLink
              to="/login"
              class="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-500 sm:block"
            >
              {{ t('common.action.login') }}
            </RouterLink>
            <RouterLink to="/register" class="btn-primary rounded-full py-2">{{ t('common.action.register') }}</RouterLink>
          </template>
          <button
            class="grid h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-100 lg:hidden"
            :aria-label="t('nav.header.menu')"
            @click="mobileOpen = !mobileOpen"
          >
            <Icon name="menu" :size="20" />
          </button>
        </div>
      </div>

      <!-- Menu mobile -->
      <div v-if="mobileOpen" class="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
        <div class="mb-3 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
          <Icon name="search" :size="15" class="text-slate-400" />
          <input
            v-model="q"
            type="search"
            :placeholder="t('nav.header.searchPublicShort')"
            class="w-full bg-transparent text-sm outline-none"
            @keyup.enter="cari"
          />
        </div>
        <template v-for="(n, i) in NAV" :key="i">
          <RouterLink
            v-if="internal(n.to)"
            :to="n.to"
            class="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-500"
            @click="mobileOpen = false"
          >
            {{ n.label }}
          </RouterLink>
          <a
            v-else
            :href="n.to"
            class="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-500"
            @click="mobileOpen = false"
          >
            {{ n.label }}
          </a>
        </template>
      </div>
    </header>

    <RouterView />

    <!-- ── Footer kaya ────────────────────────────────────────────── -->
    <footer class="mt-20 bg-slate-900 text-slate-300">
      <div class="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <BrandMark tone="dark" />
          <p class="mt-4 text-sm leading-relaxed text-slate-400">
            {{ pickText(site.footer.deskripsi, t('nav.footer.blurb')) }}
          </p>
          <div v-if="site.footer.tampilkan_sosial && site.sosialAktif.length" class="mt-4 flex items-center gap-3">
            <a
              v-for="s in site.sosialAktif"
              :key="s.platform"
              :href="safeHref(s.url)"
              :aria-label="s.platform"
              target="_blank"
              rel="noopener"
              class="grid h-9 w-9 place-items-center rounded-full bg-white/5 transition hover:bg-brand-500 hover:text-white"
            >
              <Icon :name="s.platform" :size="15" />
            </a>
          </div>
        </div>

        <div v-for="(kol, i) in KOLOM" :key="i">
          <h4 class="text-sm font-semibold uppercase tracking-wider text-white">{{ kol.judul }}</h4>
          <ul class="mt-4 space-y-2.5 text-sm">
            <li v-for="(tautan, j) in kol.tautan" :key="j">
              <RouterLink v-if="internal(tautan.url)" :to="tautan.url" class="transition hover:text-brand-400">
                {{ tautan.label }}
              </RouterLink>
              <a v-else :href="tautan.url" class="transition hover:text-brand-400">{{ tautan.label }}</a>
            </li>
          </ul>
        </div>

        <div v-if="site.footer.newsletter.aktif">
          <h4 class="text-sm font-semibold uppercase tracking-wider text-white">
            {{ pickText(site.footer.newsletter.judul, t('nav.footer.newsletter')) }}
          </h4>
          <p class="mt-4 text-sm text-slate-400">
            {{ pickText(site.footer.newsletter.teks, t('nav.footer.newsletterHint')) }}
          </p>
          <form class="mt-4 flex overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 focus-within:ring-brand-400" @submit.prevent>
            <input
              type="email"
              :placeholder="t('nav.footer.emailPlaceholder')"
              class="w-full bg-transparent px-4 py-2.5 text-sm outline-none placeholder:text-slate-500"
            />
            <button class="shrink-0 bg-brand-500 px-5 text-sm font-medium text-white transition hover:bg-brand-600">
              {{ t('common.action.send') }}
            </button>
          </form>
        </div>
      </div>
      <div class="border-t border-white/10 py-5 text-center text-xs text-slate-500">
        <template v-if="copyright">{{ copyright }}</template>
        <template v-else>
          {{ t('nav.footer.copyright', { year: tahun, name: appConfig.appName, tagline: t('common.tagline') }) }}
        </template>
      </div>
    </footer>
  </div>
</template>
