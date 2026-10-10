<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGet, apiPut, apiUpload, assetUrl, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useSiteContentStore } from '@/stores/siteContent';
import {
  DEFAULT_SITE_CONTENT,
  LOCALE_KEYS,
  SOSIAL_PLATFORMS,
  type LocaleKey,
  type SiteContent,
} from '@/lib/site-content';
import PageHeader from '@/components/ui/PageHeader.vue';
import Icon from '@/components/ui/Icon.vue';
import LocalizedField from '../components/LocalizedField.vue';

/**
 * Menu Website — mengubah content halaman depan tanpa menyentuh kode.
 *
 * Disimpan per blok, bukan per field: tombol save ada di tiap kartu dan
 * mengirim seluruh content kartu itu. Alasannya ada di sisi backend — register
 * (sosmed, kolom footer, sort_order seksi) no bisa dipangkas lewat penyimpanan
 * sebagian, karena no ada cara menyatakan "elemen ini dihapus".
 */
const auth = useAuthStore();
const site = useSiteContentStore();
const { t } = useI18n();
const canEdit = auth.can('settings.update');

/** Bahasa yang sedang disunting — valid untuk semua field di halaman ini. */
const language = ref<LocaleKey>('en');

const draft = ref<SiteContent>(structuredClone(DEFAULT_SITE_CONTENT));
const loading = ref(true);
const error = ref('');
const savingKey = ref('');
const savedKey = ref('');
const activeGroup = ref('kontak');

/** Urutan kartu; sekaligus sort_order item di panel navigasi kiri. */
const GROUPS = ['kontak', 'sosial', 'menu', 'hero', 'sections', 'footer'] as const;
type GroupKey = (typeof GROUPS)[number];

const groups = computed(() =>
  GROUPS.map((g) => ({ key: g, label: t(`website.group.${g}`), count: hitung(g) })),
);

/** Angka kecil di navigasi — berapa item yang sedang managed di kartu itu. */
function hitung(g: GroupKey): number | null {
  if (g === 'sosial') return draft.value.sosial.length;
  if (g === 'menu') return draft.value.menu.length;
  if (g === 'sections') return draft.value.sections.filter((s) => s.active).length;
  if (g === 'footer') return draft.value.footer.kolom.length;
  return null;
}

const sectionId = (g: string) => `website-group-${g}`;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiGet<SiteContent>('/site-content');
    draft.value = { ...structuredClone(DEFAULT_SITE_CONTENT), ...data };
  } catch (e) {
    error.value = errorMessage(e, t('website.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save(key: GroupKey) {
  savingKey.value = key;
  savedKey.value = '';
  error.value = '';
  try {
    const value = draft.value[key];
    await apiPut(`/site-content/${key}`, value);
    // Terapkan to store agar header/footer di layar ini pun langsung ikut.
    site.patch(key, value as never);
    savedKey.value = key;
    setTimeout(() => (savedKey.value === key ? (savedKey.value = '') : null), 1500);
  } catch (e) {
    error.value = errorMessage(e, t('website.saveFailed'));
  } finally {
    savingKey.value = '';
  }
}

// ── register yang bisa ditambah/dihapus ──────────────────────────────────────

const kosong = () => ({});

function tambahSosial() {
  const dipakai = new Set(draft.value.sosial.map((s) => s.platform));
  const berikut = SOSIAL_PLATFORMS.find((p) => !dipakai.has(p)) ?? SOSIAL_PLATFORMS[0];
  draft.value.sosial.push({ platform: berikut, url: '', active: true });
}
function tambahMenu() {
  draft.value.menu.push({ label: kosong(), url: '/', active: true });
}
function tambahKolom() {
  draft.value.footer.kolom.push({ title: kosong(), tautan: [{ label: kosong(), url: '/' }] });
}
function tambahTautan(i: number) {
  draft.value.footer.kolom[i].tautan.push({ label: kosong(), url: '/' });
}

/** Geser elemen dalam array; dipakai untuk menyusun ulang seksi & menu. */
function geser<T>(arr: T[], from: number, arah: -1 | 1) {
  const to = from + arah;
  if (to < 0 || to >= arr.length) return;
  arr.splice(to, 0, arr.splice(from, 1)[0]);
}

// ── Gambar hero ────────────────────────────────────────────────────────────

/** Sama dengan batas backend (`HERO_MAX_BYTES`). */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const heroInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadPct = ref(0);

/**
 * upload langsung sebagai byte mentah (mekanisme Media Library), bukan data
 * URL base64 di dalam JSON. Jalur lama membengkakkan berkas ±33% sehingga photo
 * hero biasa ditolak — sering by batas 1MB bawaan Nginx sebelum until to
 * aplikasi.
 */
async function pilihGambar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // agar memilih berkas yang sama lagi tetap memicu change
  if (!file) return;

  error.value = '';
  if (!ALLOWED.includes(file.type)) {
    error.value = t('website.hero.badFormat');
    return;
  }
  if (file.size > MAX_BYTES) {
    error.value = t('website.hero.tooLarge');
    return;
  }

  uploading.value = true;
  uploadPct.value = 0;
  try {
    const res = await apiUpload<{ url: string }>('/site-content/asset/hero/upload', file, (p) => {
      uploadPct.value = p;
    });
    draft.value.hero.gambar_url = res.url;
    site.patch('hero', draft.value.hero);
  } catch (e) {
    error.value = errorMessage(e, t('website.hero.uploadFailed'));
  } finally {
    uploading.value = false;
  }
}

async function hapusGambar() {
  uploading.value = true;
  error.value = '';
  try {
    await apiDelete('/site-content/asset/hero');
    draft.value.hero.gambar_url = '';
    site.patch('hero', draft.value.hero);
  } catch (e) {
    error.value = errorMessage(e, t('website.hero.uploadFailed'));
  } finally {
    uploading.value = false;
  }
}

// ── Navigasi seksi ─────────────────────────────────────────────────────────

function goToGroup(g: string) {
  activeGroup.value = g;
  document.getElementById(sectionId(g))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Sorot kartu yang sedang read. `rootMargin` on setinggi header tetap
 * (64px) plus sedikit jarak, supaya kartu dianggap active tepat saat judulnya
 * lewat di bawah header, bukan saat menyentuh tepi viewport.
 */
let observer: IntersectionObserver | null = null;

function observeSections() {
  observer?.disconnect();
  if (typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) activeGroup.value = visible.target.id.replace('website-group-', '');
    },
    { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
  );
  for (const g of GROUPS) {
    const el = document.getElementById(sectionId(g));
    if (el) observer.observe(el);
  }
}

watch(loading, (v) => {
  if (!v) nextTick(observeSections);
});
onMounted(load);
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div>
    <PageHeader :title="t('website.title')" :subtitle="t('website.subtitle')">
      <template #actions>
        <a href="/" target="_blank" rel="noopener" class="btn-outline">
          <Icon name="external-link" :size="15" /> {{ t('website.viewSite') }}
        </a>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>

    <template v-else>
      <div v-if="error" class="mb-4 alert-error">{{ error }}</div>
      <p v-if="!canEdit" class="mb-4 alert-warning">
        {{ t('website.readOnly') }}
      </p>

      <div class="grid items-start gap-6 lg:grid-cols-[16rem,1fr]">
        <!-- ── Navigasi kartu (sticky, menyorot kartu yang sedang read) ── -->
        <div class="sticky top-20 hidden space-y-3 lg:block">
          <nav class="card max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
            <button
              v-for="g in groups"
              :key="g.key"
              type="button"
              class="flex w-full items-center gap-2 rounded px-3 py-2 text-start text-sm transition"
              :class="activeGroup === g.key ? 'bg-brand-50 font-medium text-brand-600' : 'text-slate-600 hover:bg-slate-50'"
              @click="goToGroup(g.key)"
            >
              <span class="min-w-0 flex-1 truncate">{{ g.label }}</span>
              <span v-if="g.count !== null" class="num shrink-0 text-xs text-slate-400">{{ g.count }}</span>
            </button>
          </nav>

          <!-- Pemilih language valid untuk seluruh field text di halaman ini -->
          <div class="card p-3">
            <div class="mb-2 text-xs font-medium text-slate-500">{{ t('website.editingLanguage') }}</div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="l in LOCALE_KEYS"
                :key="l"
                type="button"
                class="rounded px-2.5 py-1 text-xs font-medium uppercase transition"
                :class="language === l ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                @click="language = l"
              >
                {{ l }}
              </button>
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-slate-400">{{ t('website.editingLanguageHint') }}</p>
          </div>
        </div>

        <div class="min-w-0">
          <!-- Pemilih language versi layar sempit -->
          <div class="card mb-6 flex flex-wrap items-center gap-2 p-3 lg:hidden">
            <span class="text-xs font-medium text-slate-500">{{ t('website.editingLanguage') }}</span>
            <button
              v-for="l in LOCALE_KEYS"
              :key="l"
              type="button"
              class="rounded px-2.5 py-1 text-xs font-medium uppercase transition"
              :class="language === l ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'"
              @click="language = l"
            >
              {{ l }}
            </button>
          </div>

          <!-- ── KONTAK ────────────────────────────────────────────── -->
          <section :id="sectionId('kontak')" class="card mb-6 scroll-mt-24 p-5">
            <h2 class="section-title">{{ t('website.group.kontak') }}</h2>
            <p class="mt-1 text-xs text-slate-400">{{ t('website.kontak.intro') }}</p>

            <div class="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <LocalizedField
                v-model="draft.kontak.alamat"
                :locale="language"
                :label="t('website.kontak.address')"
                :disabled="!canEdit"
              />
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="label" for="site-telepon">{{ t('website.kontak.phone') }}</label>
                  <input id="site-telepon" v-model="draft.kontak.telepon" class="input" :disabled="!canEdit" />
                </div>
                <div>
                  <label class="label" for="site-email">{{ t('website.kontak.email') }}</label>
                  <input id="site-email" v-model="draft.kontak.email" type="email" class="input" :disabled="!canEdit" />
                </div>
              </div>
              <label class="label-inline">
                <input v-model="draft.kontak.tampilkan_topbar" type="checkbox" :disabled="!canEdit" />
                {{ t('website.kontak.showTopbar') }}
              </label>
            </div>

            <button v-if="canEdit" class="btn-primary mt-4" :disabled="savingKey === 'kontak'" @click="save('kontak')">
              {{ savingKey === 'kontak' ? t('common.state.saving') : savedKey === 'kontak' ? t('website.saved') : t('common.action.save') }}
            </button>
          </section>

          <!-- ── SOSIAL MEDIA ──────────────────────────────────────── -->
          <section :id="sectionId('sosial')" class="card mb-6 scroll-mt-24 p-5">
            <h2 class="section-title">{{ t('website.group.sosial') }}</h2>
            <p class="mt-1 text-xs text-slate-400">{{ t('website.sosial.intro') }}</p>

            <div class="mt-4 space-y-2 border-t border-slate-100 pt-4">
              <div v-for="(s, i) in draft.sosial" :key="i" class="flex flex-wrap items-center gap-2">
                <select v-model="s.platform" class="input w-36 shrink-0" :disabled="!canEdit">
                  <option v-for="p in SOSIAL_PLATFORMS" :key="p" :value="p">{{ p }}</option>
                </select>
                <input v-model="s.url" class="input min-w-0 flex-1" placeholder="https://…" :disabled="!canEdit" />
                <label class="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                  <input v-model="s.active" type="checkbox" :disabled="!canEdit" /> {{ t('website.active') }}
                </label>
                <button
                  v-if="canEdit"
                  type="button"
                  class="btn-outline btn-icon text-rose-600"
                  :title="t('common.action.remove')"
                  @click="draft.sosial.splice(i, 1)"
                >
                  <Icon name="x" :size="15" />
                </button>
              </div>
              <p v-if="!draft.sosial.length" class="text-sm text-slate-400">{{ t('website.sosial.empty') }}</p>
            </div>

            <div v-if="canEdit" class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="btn-outline btn-sm" @click="tambahSosial">
                <Icon name="plus" :size="14" /> {{ t('website.sosial.add') }}
              </button>
              <button class="btn-primary btn-sm" :disabled="savingKey === 'sosial'" @click="save('sosial')">
                {{ savingKey === 'sosial' ? t('common.state.saving') : savedKey === 'sosial' ? t('website.saved') : t('common.action.save') }}
              </button>
            </div>
          </section>

          <!-- ── MENU HEADER ───────────────────────────────────────── -->
          <section :id="sectionId('menu')" class="card mb-6 scroll-mt-24 p-5">
            <h2 class="section-title">{{ t('website.group.menu') }}</h2>
            <p class="mt-1 text-xs text-slate-400">{{ t('website.menu.intro') }}</p>

            <div class="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div v-for="(m, i) in draft.menu" :key="i" class="rounded border border-slate-200 p-3">
                <div class="flex flex-wrap items-end gap-2">
                  <div class="min-w-[10rem] flex-1">
                    <LocalizedField
                      v-model="m.label"
                      :locale="language"
                      :label="t('website.menu.label')"
                      :disabled="!canEdit"
                    />
                  </div>
                  <div class="min-w-[10rem] flex-1">
                    <label class="label">{{ t('website.menu.url') }}</label>
                    <input v-model="m.url" class="input" placeholder="/courses" :disabled="!canEdit" />
                  </div>
                  <div class="flex shrink-0 items-center gap-1 pb-1">
                    <label class="flex items-center gap-1.5 text-xs text-slate-500">
                      <input v-model="m.active" type="checkbox" :disabled="!canEdit" /> {{ t('website.active') }}
                    </label>
                    <template v-if="canEdit">
                      <button type="button" class="btn-outline btn-icon" :title="t('website.moveUp')" @click="geser(draft.menu, i, -1)">
                        <Icon name="chevron-up" :size="14" />
                      </button>
                      <button type="button" class="btn-outline btn-icon" :title="t('website.moveDown')" @click="geser(draft.menu, i, 1)">
                        <Icon name="chevron-down" :size="14" />
                      </button>
                      <button type="button" class="btn-outline px-2 py-2 text-rose-600" :title="t('common.action.remove')" @click="draft.menu.splice(i, 1)">
                        <Icon name="x" :size="14" />
                      </button>
                    </template>
                  </div>
                </div>
              </div>
              <p v-if="!draft.menu.length" class="text-sm text-slate-400">{{ t('website.menu.empty') }}</p>
            </div>

            <div v-if="canEdit" class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="btn-outline btn-sm" @click="tambahMenu">
                <Icon name="plus" :size="14" /> {{ t('website.menu.add') }}
              </button>
              <button class="btn-primary btn-sm" :disabled="savingKey === 'menu'" @click="save('menu')">
                {{ savingKey === 'menu' ? t('common.state.saving') : savedKey === 'menu' ? t('website.saved') : t('common.action.save') }}
              </button>
            </div>
          </section>

          <!-- ── HERO ──────────────────────────────────────────────── -->
          <section :id="sectionId('hero')" class="card mb-6 scroll-mt-24 p-5">
            <h2 class="section-title">{{ t('website.group.hero') }}</h2>
            <p class="mt-1 text-xs text-slate-400">{{ t('website.hero.intro') }}</p>

            <div class="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <LocalizedField
                v-model="draft.hero.badge"
                :locale="language"
                :label="t('website.hero.badge')"
                :fallback="t('catalog.landing.hero.badge')"
                :disabled="!canEdit"
              />

              <div class="rounded border border-slate-200 p-3">
                <p class="mb-3 text-xs text-slate-400">{{ t('website.hero.titleHint') }}</p>
                <div class="grid gap-3 sm:grid-cols-3">
                  <LocalizedField
                    v-model="draft.hero.title_pre"
                    :locale="language"
                    :label="t('website.hero.titlePre')"
                    :fallback="t('catalog.landing.hero.titlePre')"
                    :disabled="!canEdit"
                  />
                  <LocalizedField
                    v-model="draft.hero.title_highlight"
                    :locale="language"
                    :label="t('website.hero.titleHighlight')"
                    :fallback="t('catalog.landing.hero.titleHighlight')"
                    :disabled="!canEdit"
                  />
                  <LocalizedField
                    v-model="draft.hero.title_post"
                    :locale="language"
                    :label="t('website.hero.titlePost')"
                    :fallback="t('catalog.landing.hero.titlePost')"
                    :disabled="!canEdit"
                  />
                </div>
              </div>

              <LocalizedField
                v-model="draft.hero.subjudul"
                :locale="language"
                :label="t('website.hero.subtitle')"
                :fallback="t('catalog.landing.hero.subtitle')"
                multiline
                :disabled="!canEdit"
              />

              <!-- Gambar hero -->
              <div>
                <label class="label">{{ t('website.hero.image') }}</label>
                <p class="mb-2 text-xs text-slate-400">{{ t('website.hero.imageHint') }}</p>
                <div class="grid h-40 place-items-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                  <img
                    v-if="draft.hero.gambar_url"
                    :src="assetUrl(draft.hero.gambar_url)"
                    alt=""
                    class="h-full w-full object-cover"
                  />
                  <span v-else class="text-xs text-slate-400">{{ t('website.hero.noImage') }}</span>
                </div>
                <div v-if="canEdit" class="mt-2 flex gap-2">
                  <input ref="heroInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="pilihGambar" />
                  <button class="btn-outline btn-sm" :disabled="uploading" @click="heroInput?.click()">
                    <Icon name="download" :size="14" class="rotate-180" />
                    {{ uploading ? `${t('common.state.uploading')} ${uploadPct}%` : t('website.hero.replace') }}
                  </button>
                  <button v-if="draft.hero.gambar_url" class="btn-outline btn-sm text-rose-600" :disabled="uploading" @click="hapusGambar">
                    {{ t('common.action.remove') }}
                  </button>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="label" for="hero-score">{{ t('website.hero.ratingScore') }}</label>
                  <input
                    id="hero-score"
                    v-model="draft.hero.rating_score"
                    class="input"
                    :placeholder="t('catalog.landing.hero.ratingScore')"
                    :disabled="!canEdit"
                  />
                </div>
                <LocalizedField
                  v-model="draft.hero.rating_teks"
                  :locale="language"
                  :label="t('website.hero.ratingText')"
                  :fallback="t('catalog.landing.hero.ratingSuffix')"
                  :disabled="!canEdit"
                />
              </div>

              <div class="space-y-2 border-t border-slate-100 pt-3">
                <label class="label-inline">
                  <input v-model="draft.hero.tampilkan_pencarian" type="checkbox" :disabled="!canEdit" />
                  {{ t('website.hero.showSearch') }}
                </label>
                <label class="label-inline">
                  <input v-model="draft.hero.tampilkan_rating" type="checkbox" :disabled="!canEdit" />
                  {{ t('website.hero.showRating') }}
                </label>
                <label class="label-inline">
                  <input v-model="draft.hero.tampilkan_kartu_siswa" type="checkbox" :disabled="!canEdit" />
                  {{ t('website.hero.showStudentCard') }}
                </label>
                <label class="label-inline">
                  <input v-model="draft.hero.tampilkan_kartu_kursus" type="checkbox" :disabled="!canEdit" />
                  {{ t('website.hero.showCourseCard') }}
                </label>
              </div>
            </div>

            <button v-if="canEdit" class="btn-primary mt-4" :disabled="savingKey === 'hero'" @click="save('hero')">
              {{ savingKey === 'hero' ? t('common.state.saving') : savedKey === 'hero' ? t('website.saved') : t('common.action.save') }}
            </button>
          </section>

          <!-- ── SUSUNAN SEKSI ─────────────────────────────────────── -->
          <section :id="sectionId('sections')" class="card mb-6 scroll-mt-24 p-5">
            <h2 class="section-title">{{ t('website.group.sections') }}</h2>
            <p class="mt-1 text-xs text-slate-400">{{ t('website.sections.intro') }}</p>

            <div class="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div
                v-for="(s, i) in draft.sections"
                :key="s.key"
                class="rounded border p-3"
                :class="s.active ? 'border-slate-200' : 'border-dashed border-slate-200 bg-slate-50/60'"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                    {{ i + 1 }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-slate-800">{{ t(`website.section.${s.key}.name`) }}</div>
                    <div class="text-xs text-slate-400">{{ t(`website.section.${s.key}.desc`) }}</div>
                  </div>
                  <label class="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                    <input v-model="s.active" type="checkbox" :disabled="!canEdit" /> {{ t('website.show') }}
                  </label>
                  <template v-if="canEdit">
                    <button type="button" class="btn-outline btn-icon shrink-0" :title="t('website.moveUp')" @click="geser(draft.sections, i, -1)">
                      <Icon name="chevron-up" :size="14" />
                    </button>
                    <button type="button" class="btn-outline btn-icon shrink-0" :title="t('website.moveDown')" @click="geser(draft.sections, i, 1)">
                      <Icon name="chevron-down" :size="14" />
                    </button>
                  </template>
                </div>

                <!-- Judul seksi bisa ditimpa; kosong = pakai text bawaan -->
                <div v-if="s.active" class="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                  <LocalizedField
                    v-model="s.badge"
                    :locale="language"
                    :label="t('website.sections.badge')"
                    :disabled="!canEdit"
                  />
                  <LocalizedField
                    v-model="s.title"
                    :locale="language"
                    :label="t('website.sections.heading')"
                    :disabled="!canEdit"
                  />
                  <LocalizedField
                    v-model="s.subjudul"
                    :locale="language"
                    :label="t('website.sections.subheading')"
                    :disabled="!canEdit"
                  />
                </div>
              </div>
            </div>

            <button v-if="canEdit" class="btn-primary mt-4" :disabled="savingKey === 'sections'" @click="save('sections')">
              {{ savingKey === 'sections' ? t('common.state.saving') : savedKey === 'sections' ? t('website.saved') : t('common.action.save') }}
            </button>
          </section>

          <!-- ── FOOTER ────────────────────────────────────────────── -->
          <section :id="sectionId('footer')" class="card mb-6 scroll-mt-24 p-5">
            <h2 class="section-title">{{ t('website.group.footer') }}</h2>
            <p class="mt-1 text-xs text-slate-400">{{ t('website.footer.intro') }}</p>

            <div class="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <LocalizedField
                v-model="draft.footer.description"
                :locale="language"
                :label="t('website.footer.blurb')"
                :fallback="t('nav.footer.blurb')"
                multiline
                :disabled="!canEdit"
              />

              <!-- Kolom tautan -->
              <div>
                <div class="mb-2 flex items-center justify-between">
                  <label class="label mb-0">{{ t('website.footer.columns') }}</label>
                  <button v-if="canEdit && draft.footer.kolom.length < 4" type="button" class="btn-outline btn-sm" @click="tambahKolom">
                    <Icon name="plus" :size="13" /> {{ t('website.footer.addColumn') }}
                  </button>
                </div>
                <p class="mb-2 text-xs text-slate-400">{{ t('website.footer.columnsHint') }}</p>

                <div v-if="!draft.footer.kolom.length" class="empty-inline">
                  {{ t('website.footer.columnsEmpty') }}
                </div>

                <div v-for="(kol, ki) in draft.footer.kolom" :key="ki" class="mb-3 rounded border border-slate-200 p-3">
                  <div class="flex items-end gap-2">
                    <div class="min-w-0 flex-1">
                      <LocalizedField
                        v-model="kol.title"
                        :locale="language"
                        :label="t('website.footer.columnTitle')"
                        :disabled="!canEdit"
                      />
                    </div>
                    <template v-if="canEdit">
                      <button type="button" class="btn-outline btn-icon shrink-0" :title="t('website.moveUp')" @click="geser(draft.footer.kolom, ki, -1)">
                        <Icon name="chevron-up" :size="14" />
                      </button>
                      <button type="button" class="btn-outline btn-icon text-rose-600" :title="t('common.action.remove')" @click="draft.footer.kolom.splice(ki, 1)">
                        <Icon name="x" :size="14" />
                      </button>
                    </template>
                  </div>

                  <div class="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <div v-for="(tautan, ti) in kol.tautan" :key="ti" class="flex flex-wrap items-end gap-2">
                      <div class="min-w-[9rem] flex-1">
                        <LocalizedField
                          v-model="tautan.label"
                          :locale="language"
                          :label="t('website.footer.linkLabel')"
                          :disabled="!canEdit"
                        />
                      </div>
                      <div class="min-w-[9rem] flex-1">
                        <label class="label">{{ t('website.footer.linkUrl') }}</label>
                        <input v-model="tautan.url" class="input" placeholder="/courses" :disabled="!canEdit" />
                      </div>
                      <button
                        v-if="canEdit"
                        type="button"
                        class="btn-outline btn-icon text-rose-600"
                        :title="t('common.action.remove')"
                        @click="kol.tautan.splice(ti, 1)"
                      >
                        <Icon name="x" :size="14" />
                      </button>
                    </div>
                    <button v-if="canEdit" type="button" class="btn-outline btn-sm" @click="tambahTautan(ki)">
                      <Icon name="plus" :size="13" /> {{ t('website.footer.addLink') }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Newsletter -->
              <div class="space-y-3 border-t border-slate-100 pt-4">
                <label class="label-inline">
                  <input v-model="draft.footer.newsletter.active" type="checkbox" :disabled="!canEdit" />
                  {{ t('website.footer.newsletterShow') }}
                </label>
                <div v-if="draft.footer.newsletter.active" class="grid gap-3 sm:grid-cols-2">
                  <LocalizedField
                    v-model="draft.footer.newsletter.title"
                    :locale="language"
                    :label="t('website.footer.newsletterTitle')"
                    :fallback="t('nav.footer.newsletter')"
                    :disabled="!canEdit"
                  />
                  <LocalizedField
                    v-model="draft.footer.newsletter.text"
                    :locale="language"
                    :label="t('website.footer.newsletterText')"
                    :fallback="t('nav.footer.newsletterHint')"
                    :disabled="!canEdit"
                  />
                </div>
              </div>

              <div class="space-y-3 border-t border-slate-100 pt-4">
                <label class="label-inline">
                  <input v-model="draft.footer.tampilkan_sosial" type="checkbox" :disabled="!canEdit" />
                  {{ t('website.footer.showSocial') }}
                </label>
                <LocalizedField
                  v-model="draft.footer.copyright"
                  :locale="language"
                  :label="t('website.footer.copyright')"
                  :hint="t('website.footer.copyrightHint')"
                  :disabled="!canEdit"
                />
              </div>
            </div>

            <button v-if="canEdit" class="btn-primary mt-4" :disabled="savingKey === 'footer'" @click="save('footer')">
              {{ savingKey === 'footer' ? t('common.state.saving') : savedKey === 'footer' ? t('website.saved') : t('common.action.save') }}
            </button>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
