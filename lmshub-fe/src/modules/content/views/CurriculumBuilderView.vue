<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import MediaUploadButton from '@/modules/content/components/MediaUploadButton.vue';

type LessonType = 'video' | 'teks' | 'pdf' | 'kuis' | 'tugas' | 'live_class' | 'embed' | 'scorm';
const LESSON_TYPES: LessonType[] = ['video', 'teks', 'pdf', 'kuis', 'tugas', 'live_class', 'embed', 'scorm'];

interface CourseOption {
  id: string;
  judul: string;
}
interface Section {
  id: string;
  course_id: string;
  judul: string;
  urutan: number;
  deskripsi: string | null;
}
interface Lesson {
  id: string;
  section_id: string;
  judul: string;
  tipe: LessonType;
  urutan: number;
  durasi_menit: number | null;
  gratis_preview: boolean;
}

/**
 * Tipe isi pelajaran. Lebih sempit dari tipe pelajaran: 'kuis', 'tugas' dan
 * 'live_class' tidak punya baris isi — masing-masing dirakit di layar Asesmen
 * dan Live Class, lalu ditautkan ke pelajaran lewat tipe pelajarannya.
 */
type ContentType = 'video' | 'teks' | 'pdf' | 'embed' | 'scorm';
const CONTENT_TYPES: ContentType[] = ['video', 'teks', 'pdf', 'embed', 'scorm'];
/** Tipe yang isinya berupa berkas/tautan, bukan teks atau paket SCORM. */
const LINK_TYPES: ContentType[] = ['video', 'pdf', 'embed'];

interface LessonContent {
  id: string;
  lesson_id: string;
  tipe: ContentType;
  urutan: number;
  body: string | null;
  media_asset_id: string | null;
  url: string | null;
  scorm_manifest_url: string | null;
  durasi_detik: number | null;
}

interface MediaAsset {
  id: string;
  nama_file: string;
  tipe_file: 'video' | 'gambar' | 'dokumen' | 'audio';
  status_transcode: string;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** Label tipe pelajaran diambil dari katalog i18n agar ikut ganti bahasa. */
const lessonTypeLabel = (tipe: LessonType) => t(`content.lessonType.${tipe}`);

const courses = ref<CourseOption[]>([]);
const selectedCourseId = ref<string>((route.query.courseId as string) || '');
const sections = ref<Section[]>([]);
const lessonsBySection = ref<Record<string, Lesson[]>>({});

const loadingCourses = ref(true);
const loadingCurriculum = ref(false);
const error = ref('');
const busy = ref(false);

const newSectionTitle = ref('');
const newLessonTitle = ref<Record<string, string>>({});
const newLessonType = ref<Record<string, LessonType>>({});

const hasCourse = computed(() => !!selectedCourseId.value);

// ── Isi pelajaran ─────────────────────────────────────────────────────────
// Backend sudah lama menyediakan CRUD `lesson_contents`, tapi tidak ada layar
// yang memanggilnya: kurikulum bisa dirangkai namun pelajarannya tetap kosong,
// dan video pada data demo masuk lewat seeder SQL. Panel di bawah ini yang
// menutup celah itu.

const openLessonId = ref<string | null>(null);
const contents = ref<Record<string, LessonContent[]>>({});
const contentLoading = ref(false);
const contentError = ref('');
const editingContentId = ref<string | null>(null);
const mediaAssets = ref<MediaAsset[]>([]);

/**
 * 'media' = an asset in the Media Library (uploaded to this server), 'link' = a
 * web address. Media comes first: self-hosted video is the common case, and an
 * external URL is the fallback, not the default.
 */
const contentSource = ref<'link' | 'media'>('media');

const contentForm = ref({
  tipe: 'video' as ContentType,
  url: '',
  body: '',
  media_asset_id: '',
  scorm_manifest_url: '',
  durasi_menit: 0,
});

const contentTypeLabel = (tipe: ContentType) => t(`content.lessonType.${tipe}`);
const isLinkType = computed(() => LINK_TYPES.includes(contentForm.value.tipe));

/** Aset yang masuk akal untuk tipe isi yang sedang dipilih. */
const mediaChoices = computed(() => {
  const want = contentForm.value.tipe === 'video' ? 'video' : 'dokumen';
  return mediaAssets.value.filter((m) => m.tipe_file === want);
});

/** File types the inline upload offers for the content type being edited. */
const uploadAccept = computed(() =>
  contentForm.value.tipe === 'video' ? 'video/mp4,video/webm,video/ogg' : 'application/pdf',
);

/** A file uploaded from inside the lesson form is selected straight away. */
function onAssetUploaded(asset: { id: string }) {
  mediaAssets.value = [asset as MediaAsset, ...mediaAssets.value.filter((m) => m.id !== asset.id)];
  contentForm.value.media_asset_id = asset.id;
}

function resetContentForm() {
  editingContentId.value = null;
  contentSource.value = 'media';
  contentForm.value = { tipe: 'video', url: '', body: '', media_asset_id: '', scorm_manifest_url: '', durasi_menit: 0 };
}

async function loadMediaAssets() {
  if (mediaAssets.value.length) return;
  try {
    const res = await apiGetFull<MediaAsset[]>('/media', { limit: 100 });
    mediaAssets.value = res.data ?? [];
  } catch {
    // Pustaka Media memakai izin 'konten.view'. Bila pengguna tidak punya, panel
    // tetap berguna lewat alamat web — jadi kegagalan di sini tidak ditampilkan.
    mediaAssets.value = [];
  }
}

async function loadContents(lessonId: string) {
  contentLoading.value = true;
  contentError.value = '';
  try {
    const res = await apiGetFull<LessonContent[]>(`/lessons/${lessonId}/contents`);
    contents.value[lessonId] = (res.data ?? []).slice().sort((a, b) => a.urutan - b.urutan);
  } catch (e) {
    contentError.value = errorMessage(e, t('content.contents.loadFailed'));
    contents.value[lessonId] = [];
  } finally {
    contentLoading.value = false;
  }
}

async function toggleContents(lesson: Lesson) {
  if (openLessonId.value === lesson.id) {
    openLessonId.value = null;
    return;
  }
  openLessonId.value = lesson.id;
  resetContentForm();
  // Tipe isi mengikuti tipe pelajaran bila keduanya sepadan.
  if (CONTENT_TYPES.includes(lesson.tipe as ContentType)) {
    contentForm.value.tipe = lesson.tipe as ContentType;
  }
  await Promise.all([loadContents(lesson.id), loadMediaAssets()]);
}

/** Ringkasan satu baris untuk daftar isi yang sudah tersimpan. */
function contentSummary(c: LessonContent): string {
  if (c.tipe === 'teks') {
    const plain = (c.body ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > 90 ? `${plain.slice(0, 90)}…` : plain || t('content.contents.emptyBody');
  }
  if (c.tipe === 'scorm') return c.scorm_manifest_url ?? '—';
  if (c.url) return c.url;
  if (c.media_asset_id) {
    const m = mediaAssets.value.find((a) => a.id === c.media_asset_id);
    return m ? m.nama_file : t('content.contents.fromLibrary');
  }
  return '—';
}

async function submitContent(lessonId: string) {
  const f = contentForm.value;
  const payload: Record<string, unknown> = { tipe: f.tipe };

  if (f.tipe === 'teks') {
    if (!f.body.trim()) {
      contentError.value = t('content.contents.bodyRequired');
      return;
    }
    payload.body = f.body;
  } else if (f.tipe === 'scorm') {
    if (!f.scorm_manifest_url.trim()) {
      contentError.value = t('content.contents.manifestRequired');
      return;
    }
    payload.scorm_manifest_url = f.scorm_manifest_url.trim();
  } else if (contentSource.value === 'media') {
    if (!f.media_asset_id) {
      contentError.value = t('content.contents.assetRequired');
      return;
    }
    payload.media_asset_id = f.media_asset_id;
    // Switching an existing lesson from a web address to a library file must
    // clear the address: the player prefers `url` when both are set, so the
    // old link would keep playing. (Create rejects null, so edit only.)
    if (editingContentId.value) payload.url = null;
  } else {
    // Dicegat di sini dengan pesan yang menjelaskan bentuk yang diterima, alih-alih
    // 'Validation failed' dari backend yang tidak menolong. Path berawalan '/'
    // ikut diterima: itu berkas di server ini sendiri, di bawah `uploads/`.
    const url = f.url.trim();
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
      contentError.value = t('content.contents.urlAbsolute');
      return;
    }
    payload.url = url;
    if (editingContentId.value) payload.media_asset_id = null;
  }

  if (f.tipe === 'video' && f.durasi_menit > 0) payload.durasi_detik = Math.round(f.durasi_menit * 60);

  busy.value = true;
  contentError.value = '';
  try {
    if (editingContentId.value) {
      await apiPut(`/contents/${editingContentId.value}`, payload);
    } else {
      payload.urutan = (contents.value[lessonId] || []).length;
      await apiPost(`/lessons/${lessonId}/contents`, payload);
    }
    resetContentForm();
    await loadContents(lessonId);
  } catch (e) {
    contentError.value = errorMessage(e, t('content.contents.saveFailed'));
  } finally {
    busy.value = false;
  }
}

function editContent(c: LessonContent) {
  editingContentId.value = c.id;
  contentSource.value = c.media_asset_id ? 'media' : 'link';
  contentForm.value = {
    tipe: c.tipe,
    url: c.url ?? '',
    body: c.body ?? '',
    media_asset_id: c.media_asset_id ?? '',
    scorm_manifest_url: c.scorm_manifest_url ?? '',
    durasi_menit: c.durasi_detik ? Math.round(c.durasi_detik / 60) : 0,
  };
  contentError.value = '';
}

async function removeContent(lessonId: string, id: string) {
  if (!window.confirm(t('content.contents.confirmDelete'))) return;
  busy.value = true;
  contentError.value = '';
  try {
    await apiDelete(`/contents/${id}`);
    if (editingContentId.value === id) resetContentForm();
    await loadContents(lessonId);
  } catch (e) {
    contentError.value = errorMessage(e, t('content.contents.deleteFailed'));
  } finally {
    busy.value = false;
  }
}

/**
 * Tidak ada endpoint reorder khusus untuk isi pelajaran, jadi urutan ditukar
 * lewat dua kali PUT — cukup karena satu pelajaran jarang punya banyak isi.
 */
async function moveContent(lessonId: string, id: string, dir: -1 | 1) {
  const list = contents.value[lessonId] || [];
  const idx = list.findIndex((c) => c.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
  busy.value = true;
  contentError.value = '';
  try {
    await apiPut(`/contents/${list[idx].id}`, { urutan: swapIdx });
    await apiPut(`/contents/${list[swapIdx].id}`, { urutan: idx });
    await loadContents(lessonId);
  } catch (e) {
    contentError.value = errorMessage(e, t('content.contents.reorderFailed'));
  } finally {
    busy.value = false;
  }
}

async function loadCourses() {
  loadingCourses.value = true;
  try {
    // Backend otomatis membatasi instruktur non-admin ke kursus miliknya sendiri.
    const res = await apiGetFull<CourseOption[]>('/courses', { limit: 100 });
    courses.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.loadCoursesFailed'));
    courses.value = [];
  } finally {
    loadingCourses.value = false;
  }
}

async function loadCurriculum() {
  if (!selectedCourseId.value) {
    sections.value = [];
    lessonsBySection.value = {};
    return;
  }
  loadingCurriculum.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<Section[]>(`/courses/${selectedCourseId.value}/sections`);
    sections.value = (res.data ?? []).slice().sort((a, b) => a.urutan - b.urutan);
    const entries = await Promise.all(
      sections.value.map(async (s) => {
        const lr = await apiGetFull<Lesson[]>(`/sections/${s.id}/lessons`);
        return [s.id, (lr.data ?? []).slice().sort((a, b) => a.urutan - b.urutan)] as const;
      }),
    );
    lessonsBySection.value = Object.fromEntries(entries);
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.loadFailed'));
    sections.value = [];
    lessonsBySection.value = {};
  } finally {
    loadingCurriculum.value = false;
  }
}

function selectCourse(id: string) {
  selectedCourseId.value = id;
  router.replace({ query: { ...route.query, courseId: id || undefined } });
}

async function addSection() {
  if (!newSectionTitle.value.trim() || !selectedCourseId.value) return;
  busy.value = true;
  try {
    await apiPost(`/courses/${selectedCourseId.value}/sections`, {
      judul: newSectionTitle.value.trim(),
      urutan: sections.value.length,
    });
    newSectionTitle.value = '';
    await loadCurriculum();
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.addSectionFailed'));
  } finally {
    busy.value = false;
  }
}

async function removeSection(id: string) {
  busy.value = true;
  try {
    await apiDelete(`/sections/${id}`);
    await loadCurriculum();
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.deleteSectionFailed'));
  } finally {
    busy.value = false;
  }
}

async function moveSection(id: string, dir: -1 | 1) {
  const idx = sections.value.findIndex((s) => s.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sections.value.length) return;
  const items = sections.value.map((s, i) => ({ id: s.id, urutan: i }));
  const tmp = items[idx].urutan;
  items[idx].urutan = items[swapIdx].urutan;
  items[swapIdx].urutan = tmp;
  busy.value = true;
  try {
    await apiPut(`/courses/${selectedCourseId.value}/sections/reorder`, { items });
    await loadCurriculum();
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.reorderSectionFailed'));
  } finally {
    busy.value = false;
  }
}

async function addLesson(sectionId: string) {
  const judul = (newLessonTitle.value[sectionId] || '').trim();
  if (!judul) return;
  busy.value = true;
  try {
    await apiPost(`/sections/${sectionId}/lessons`, {
      judul,
      tipe: newLessonType.value[sectionId] || 'video',
      urutan: (lessonsBySection.value[sectionId] || []).length,
    });
    newLessonTitle.value[sectionId] = '';
    await loadCurriculum();
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.addLessonFailed'));
  } finally {
    busy.value = false;
  }
}

async function removeLesson(id: string) {
  busy.value = true;
  try {
    await apiDelete(`/lessons/${id}`);
    await loadCurriculum();
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.deleteLessonFailed'));
  } finally {
    busy.value = false;
  }
}

async function moveLesson(sectionId: string, id: string, dir: -1 | 1) {
  const list = lessonsBySection.value[sectionId] || [];
  const idx = list.findIndex((l) => l.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
  const items = list.map((l, i) => ({ id: l.id, urutan: i, section_id: sectionId }));
  const tmp = items[idx].urutan;
  items[idx].urutan = items[swapIdx].urutan;
  items[swapIdx].urutan = tmp;
  busy.value = true;
  try {
    await apiPut('/lessons/reorder', { items });
    await loadCurriculum();
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.reorderLessonFailed'));
  } finally {
    busy.value = false;
  }
}

async function toggleFreePreview(lesson: Lesson) {
  busy.value = true;
  try {
    await apiPut(`/lessons/${lesson.id}`, { gratis_preview: !lesson.gratis_preview });
    await loadCurriculum();
  } catch (e) {
    error.value = errorMessage(e, t('content.builder.previewFailed'));
  } finally {
    busy.value = false;
  }
}

watch(selectedCourseId, loadCurriculum);
onMounted(async () => {
  await loadCourses();
  if (selectedCourseId.value) await loadCurriculum();
});
</script>

<template>
  <div>
    <PageHeader :title="t('content.builder.title')" :subtitle="t('content.builder.subtitle')" />

    <div class="card mb-4 p-4">
      <label class="label">{{ t('content.builder.pickCourse') }}</label>
      <select
        class="input max-w-md"
        :value="selectedCourseId"
        :disabled="loadingCourses"
        @change="selectCourse(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('content.builder.pickPlaceholder') }}</option>
        <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.judul }}</option>
      </select>
    </div>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <div v-if="!hasCourse" class="empty-state">{{ t('content.builder.needCourse') }}</div>
    <div v-else-if="loadingCurriculum" class="empty-state">
      {{ t('content.builder.loadingCurriculum') }}
    </div>
    <div v-else class="space-y-4">
      <div v-if="!sections.length" class="empty-state">
        {{ t('content.builder.emptyCurriculum') }}
      </div>

      <div v-for="(s, si) in sections" :key="s.id" class="card p-4">
        <div class="mb-3 flex items-start justify-between gap-2">
          <div>
            <span class="text-xs text-slate-400">{{ t('content.builder.sectionN', { n: fmtAngka(si + 1) }) }}</span>
            <h3 class="card-title">{{ s.judul }}</h3>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button class="btn-outline btn-sm" :disabled="busy || si === 0" @click="moveSection(s.id, -1)">↑</button>
            <button
              class="btn-outline btn-sm"
              :disabled="busy || si === sections.length - 1"
              @click="moveSection(s.id, 1)"
            >
              ↓
            </button>
            <button v-can="'kurikulum.delete'" class="btn-outline btn-sm text-rose-600" :disabled="busy" @click="removeSection(s.id)">
              {{ t('common.action.delete') }}
            </button>
          </div>
        </div>

        <ul class="space-y-1.5">
          <li v-for="(l, li) in lessonsBySection[s.id] || []" :key="l.id" class="rounded-lg bg-slate-50">
          <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-800">{{ lessonTypeLabel(l.tipe) }}</span>
              <span class="text-slate-700">{{ l.judul }}</span>
              <span v-if="l.gratis_preview" class="text-[10px] font-medium text-emerald-600">
                {{ t('content.builder.freePreview') }}
              </span>
              <span v-if="l.durasi_menit" class="text-xs text-slate-400">
                {{ fmtAngka(l.durasi_menit) }} {{ t('content.builder.minShort') }}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <button class="btn-outline btn-sm" :disabled="busy || li === 0" @click="moveLesson(s.id, l.id, -1)">↑</button>
              <button
                class="btn-outline btn-sm"
                :disabled="busy || li === (lessonsBySection[s.id] || []).length - 1"
                @click="moveLesson(s.id, l.id, 1)"
              >
                ↓
              </button>
              <button class="btn-outline btn-sm" :disabled="busy" @click="toggleFreePreview(l)">
                {{ l.gratis_preview ? t('content.builder.cancelPreview') : t('content.builder.freePreview') }}
              </button>
              <!-- Tanpa tombol ini pelajaran hanya berupa judul: video, teks dan
                   PDF-nya tidak punya tempat untuk diisi. -->
              <button
                v-can="'konten.view'"
                class="btn-outline btn-sm"
                :class="openLessonId === l.id ? 'border-brand-400 text-brand-600' : ''"
                :disabled="busy"
                @click="toggleContents(l)"
              >
                {{ t('content.contents.manage') }}
              </button>
              <button v-can="'kurikulum.delete'" class="btn-outline px-2 py-0.5 text-xs text-rose-600" :disabled="busy" @click="removeLesson(l.id)">
                {{ t('common.action.delete') }}
              </button>
            </div>
          </div>

          <!-- Panel isi pelajaran -->
          <div v-if="openLessonId === l.id" class="border-t border-slate-200 px-3 py-3">
            <p v-if="contentError" class="mb-3 alert-error">{{ contentError }}</p>
            <p v-if="contentLoading" class="text-xs text-slate-400">{{ t('common.state.loading') }}</p>

            <ul v-else-if="(contents[l.id] || []).length" class="mb-3 space-y-1.5">
              <li
                v-for="(c, ci) in contents[l.id]"
                :key="c.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {{ contentTypeLabel(c.tipe) }}
                  </span>
                  <span class="truncate text-slate-600">{{ contentSummary(c) }}</span>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <button class="btn-outline btn-sm" :disabled="busy || ci === 0" @click="moveContent(l.id, c.id, -1)">↑</button>
                  <button
                    class="btn-outline btn-sm"
                    :disabled="busy || ci === (contents[l.id] || []).length - 1"
                    @click="moveContent(l.id, c.id, 1)"
                  >
                    ↓
                  </button>
                  <button v-can="'konten.update'" class="btn-outline btn-sm" :disabled="busy" @click="editContent(c)">
                    {{ t('common.action.edit') }}
                  </button>
                  <button
                    v-can="'konten.delete'"
                    class="btn-outline px-2 py-0.5 text-[11px] text-rose-600"
                    :disabled="busy"
                    @click="removeContent(l.id, c.id)"
                  >
                    {{ t('common.action.delete') }}
                  </button>
                </div>
              </li>
            </ul>
            <p v-else class="mb-3 text-xs text-slate-400">{{ t('content.contents.empty') }}</p>

            <!-- Formulir tambah / ubah isi -->
            <div v-can="'konten.create'" class="rounded border border-slate-200 bg-white p-3">
              <p class="mb-2 text-xs font-medium text-slate-600">
                {{ editingContentId ? t('content.contents.formEdit') : t('content.contents.formNew') }}
              </p>

              <div class="grid gap-2 sm:grid-cols-2">
                <div>
                  <label class="label">{{ t('content.contents.type') }}</label>
                  <select v-model="contentForm.tipe" class="input">
                    <option v-for="ct in CONTENT_TYPES" :key="ct" :value="ct">{{ contentTypeLabel(ct) }}</option>
                  </select>
                </div>

                <div v-if="isLinkType">
                  <label class="label">{{ t('content.contents.source') }}</label>
                  <select v-model="contentSource" class="input">
                    <option value="media">{{ t('content.contents.sourceMedia') }}</option>
                    <option value="link">{{ t('content.contents.sourceLink') }}</option>
                  </select>
                </div>

                <div v-if="isLinkType && contentSource === 'link'" class="sm:col-span-2">
                  <label class="label">{{ t('content.contents.url') }}</label>
                  <input v-model="contentForm.url" class="input" placeholder="https://…" />
                  <p class="mt-1 text-xs text-slate-400">{{ t('content.contents.urlHint') }}</p>
                </div>

                <div v-if="isLinkType && contentSource === 'media'" class="sm:col-span-2">
                  <label class="label">{{ t('content.contents.asset') }}</label>
                  <select v-model="contentForm.media_asset_id" class="input">
                    <option value="">{{ t('common.action.choose') }}</option>
                    <option v-for="m in mediaChoices" :key="m.id" :value="m.id">
                      {{ m.nama_file }}<template v-if="m.tipe_file === 'video' && m.status_transcode !== 'selesai'">
                        — {{ t('content.contents.notReady') }}
</template>
                    </option>
                  </select>
                  <p class="mt-1 text-xs text-slate-400">{{ t('content.contents.assetHint') }}</p>
                  <div v-can="'konten.create'" class="mt-2 flex flex-wrap items-center gap-2">
                    <span class="text-xs text-slate-500">{{ t('content.contents.orUpload') }}</span>
                    <MediaUploadButton :accept="uploadAccept" :label="t('content.contents.uploadNew')" @uploaded="onAssetUploaded" />
                  </div>
                </div>

                <div v-if="contentForm.tipe === 'teks'" class="sm:col-span-2">
                  <label class="label">{{ t('content.contents.body') }}</label>
                  <textarea v-model="contentForm.body" rows="5" class="input" :placeholder="t('content.contents.bodyPlaceholder')"></textarea>
                  <p class="mt-1 text-xs text-slate-400">{{ t('content.contents.bodyHint') }}</p>
                </div>

                <div v-if="contentForm.tipe === 'scorm'" class="sm:col-span-2">
                  <label class="label">{{ t('content.contents.manifest') }}</label>
                  <input v-model="contentForm.scorm_manifest_url" class="input" placeholder="https://…/imsmanifest.xml" />
                </div>

                <div v-if="contentForm.tipe === 'video'">
                  <label class="label">{{ t('content.contents.duration') }}</label>
                  <input v-model.number="contentForm.durasi_menit" type="number" min="0" class="input" />
                </div>
              </div>

              <div class="mt-3 flex justify-end gap-2">
                <button v-if="editingContentId" class="btn-outline btn-sm" @click="resetContentForm">
                  {{ t('common.action.cancel') }}
                </button>
                <button class="btn-primary btn-sm" :disabled="busy" @click="submitContent(l.id)">
                  {{ busy ? t('common.state.saving') : t('common.action.save') }}
                </button>
              </div>
            </div>
          </div>
          </li>
          <li v-if="!(lessonsBySection[s.id] || []).length" class="px-3 py-2 text-xs text-slate-400">
            {{ t('content.builder.noLessons') }}
          </li>
        </ul>

        <div v-can="'kurikulum.create'" class="mt-3 flex flex-wrap gap-2">
          <input
            v-model="newLessonTitle[s.id]"
            class="input max-w-xs"
            :placeholder="t('content.builder.newLessonPlaceholder')"
            @keyup.enter="addLesson(s.id)"
          />
          <select v-model="newLessonType[s.id]" class="input w-auto">
            <option v-for="lt in LESSON_TYPES" :key="lt" :value="lt">{{ lessonTypeLabel(lt) }}</option>
          </select>
          <button class="btn-outline" :disabled="busy" @click="addLesson(s.id)">{{ t('content.builder.addLesson') }}</button>
        </div>
      </div>

      <div v-can="'kurikulum.create'" class="card flex flex-wrap gap-2 p-4">
        <input
          v-model="newSectionTitle"
          class="input max-w-xs"
          :placeholder="t('content.builder.newSectionPlaceholder')"
          @keyup.enter="addSection"
        />
        <button class="btn-primary" :disabled="busy" @click="addSection">{{ t('content.builder.addSection') }}</button>
      </div>
    </div>
  </div>
</template>
