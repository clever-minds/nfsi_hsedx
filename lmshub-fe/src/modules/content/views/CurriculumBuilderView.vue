<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import MediaUploadButton from '@/modules/content/components/MediaUploadButton.vue';
import RichTextEditor from '@/components/ui/RichTextEditor.vue';
import { getLocalizedText, splitLocalizedText, combineLocalizedText, splitLessonContent, createBilingualLessonHtml } from '@/lib/course-localization';

type LessonType = 'video' | 'text' | 'pdf' | 'quiz' | 'assignment' | 'live_class' | 'scorm' | 'embed';
const LESSON_TYPES: LessonType[] = ['video', 'text', 'pdf', 'quiz', 'assignment', 'live_class', 'scorm', 'embed'];

interface CourseOption {
  id: string;
  title: string;
}
interface Section {
  id: string;
  course_id: string;
  title: string;
  sort_order: number;
  description: string | null;
}
interface Lesson {
  id: string;
  section_id: string;
  title: string;
  type: LessonType;
  sort_order: number;
  duration_minutes: number | null;
  gratis_preview: boolean;
}

/**
 * Tipe content pelajaran. Lebih sempit from type pelajaran: 'quiz', 'assignment' dan
 * 'live_class' no punya baris content — masing-masing dirakit di layar Assessment
 * dan Live Class, lalu ditautkan to pelajaran lewat type pelajarannya.
 */
type ContentType = 'video' | 'text' | 'pdf' | 'scorm' | 'embed';
const CONTENT_TYPES: ContentType[] = ['video', 'text', 'pdf'];
/** Tipe yang isinya berupa berkas/tautan, bukan text atau package SCORM. */
const LINK_TYPES: ContentType[] = ['video', 'pdf'];

interface LessonContent {
  id: string;
  lesson_id: string;
  type: ContentType;
  sort_order: number;
  body: string | null;
  media_asset_id: string | null;
  url: string | null;
  scorm_manifest_url: string | null;
  duration_seconds: number | null;
  language?: 'all' | 'en' | 'hi';
}

interface MediaAsset {
  id: string;
  file_name: string;
  file_type: 'video' | 'image' | 'document' | 'audio';
  status_transcode: string;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

/** Label type pelajaran diambil from catalog i18n agar ikut ganti language. */
const lessonTypeLabel = (type: LessonType) => t(`content.lessonType.${type}`);

const courses = ref<CourseOption[]>([]);
const selectedCourseId = ref<string>((route.query.courseId as string) || '');
const sections = ref<Section[]>([]);
const lessonsBySection = ref<Record<string, Lesson[]>>({});

const loadingCourses = ref(true);
const loadingCurriculum = ref(false);
const error = ref('');
const notice = ref('');
const busy = ref(false);

function showNotice(msg: string) {
  notice.value = msg;
  setTimeout(() => notice.value = '', 3000);
}

const newSectionTitle = ref('');
const newSectionTitleEn = ref('');
const newSectionTitleHi = ref('');

const newLessonTitle = ref<Record<string, string>>({});
const newLessonTitleEn = ref<Record<string, string>>({});
const newLessonTitleHi = ref<Record<string, string>>({});
const newLessonType = ref<Record<string, LessonType>>({});

const contentBodyEn = ref('');
const contentBodyHi = ref('');
const contentBodyLang = ref<'en' | 'hi'>('en');

const contentMediaLang = ref<'en' | 'hi'>('en');
const mediaEn = ref({
  source: 'media' as 'media' | 'link',
  url: '',
  media_asset_id: '',
});
const mediaHi = ref({
  source: 'media' as 'media' | 'link',
  url: '',
  media_asset_id: '',
});

const hasCourse = computed(() => !!selectedCourseId.value);

// ── Isi pelajaran ─────────────────────────────────────────────────────────
// Backend sudah lama menyediakan CRUD `lesson_contents`, tapi no ada layar
// yang memanggilnya: kurikulum bisa dirangkai namun pelajarannya tetap kosong,
// dan video pada data demo login lewat seeder SQL. Panel di bawah ini yang
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
  type: 'video' as ContentType,
  url: '',
  body: '',
  media_asset_id: '',
  scorm_manifest_url: '',
  duration_minutes: 0,
  language: 'all' as 'all' | 'en' | 'hi',
});

const contentTypeLabel = (type: ContentType) => t(`content.lessonType.${type}`);
const isLinkType = computed(() => LINK_TYPES.includes(contentForm.value.type));

/** Aset yang login akal untuk type content yang sedang dipilih. */
const mediaChoices = computed(() => {
  const want = contentForm.value.type === 'video' ? 'video' : 'document';
  return mediaAssets.value.filter((m) => m.file_type === want);
});

/** File types the inline upload offers for the content type being edited. */
const uploadAccept = computed(() => '*/*');

/** A file uploaded from inside the lesson form is selected straight away. */
function onAssetUploaded(asset: { id: string }) {
  mediaAssets.value = [asset as MediaAsset, ...mediaAssets.value.filter((m) => m.id !== asset.id)];
  if (contentForm.value.type === 'video' || contentForm.value.type === 'pdf') {
    if (contentMediaLang.value === 'hi') {
      mediaHi.value.media_asset_id = asset.id;
      mediaHi.value.source = 'media';
    } else {
      mediaEn.value.media_asset_id = asset.id;
      mediaEn.value.source = 'media';
    }
  }
  contentForm.value.media_asset_id = asset.id;
}

function resetContentForm() {
  editingContentId.value = null;
  contentSource.value = 'media';
  contentBodyEn.value = '';
  contentBodyHi.value = '';
  contentBodyLang.value = 'en';
  contentMediaLang.value = 'en';
  mediaEn.value = { source: 'media', url: '', media_asset_id: '' };
  mediaHi.value = { source: 'media', url: '', media_asset_id: '' };
  contentForm.value = { type: 'video', url: '', body: '', media_asset_id: '', scorm_manifest_url: '', duration_minutes: 0, language: 'all' };
}

async function loadMediaAssets() {
  if (mediaAssets.value.length) return;
  try {
    const res = await apiGetFull<MediaAsset[]>('/media', { limit: 100 });
    mediaAssets.value = res.data ?? [];
  } catch {
    // Pustaka Media memakai izin 'content.view'. Bila user no punya, panel
    // tetap berguna lewat alamat web — jadi kegagalan di sini no ditampilkan.
    mediaAssets.value = [];
  }
}

async function loadContents(lessonId: string) {
  contentLoading.value = true;
  contentError.value = '';
  try {
    const res = await apiGetFull<LessonContent[]>(`/lessons/${lessonId}/contents`);
    contents.value[lessonId] = (res.data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
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
  // Tipe content mengikuti type pelajaran bila keduanya sepadan.
  if (CONTENT_TYPES.includes(lesson.type as ContentType)) {
    contentForm.value.type = lesson.type as ContentType;
  }
  await Promise.all([loadContents(lesson.id), loadMediaAssets()]);
}

/** Ringkasan satu baris untuk register content yang sudah tersimpan. */
function contentSummary(c: LessonContent): string {
  if (c.type === 'text') {
    const plain = (c.body ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.length > 90 ? `${plain.slice(0, 90)}…` : plain || t('content.contents.emptyBody');
  }
  if (c.type === 'scorm') return c.scorm_manifest_url ?? '—';
  if (c.url) return c.url;
  if (c.media_asset_id) {
    const m = mediaAssets.value.find((a) => a.id === c.media_asset_id);
    return m ? m.file_name : t('content.contents.fromLibrary');
  }
  return '—';
}

async function submitContent(lessonId: string) {
  const f = contentForm.value;
  const payload: Record<string, unknown> = { type: f.type };

  if (f.type === 'text') {
    const en = contentBodyEn.value.trim();
    const hi = contentBodyHi.value.trim();
    if (en && hi) {
      payload.body = createBilingualLessonHtml(en, hi);
    } else if (hi) {
      payload.body = hi;
    } else if (en) {
      payload.body = en;
    } else if (f.body.trim()) {
      payload.body = f.body.trim();
    } else {
      contentError.value = t('content.contents.bodyRequired');
      return;
    }
  } else if (f.type === 'video' || f.type === 'pdf') {
    const hasEn = mediaEn.value.source === 'media' ? !!mediaEn.value.media_asset_id : !!mediaEn.value.url.trim();
    const hasHi = mediaHi.value.source === 'media' ? !!mediaHi.value.media_asset_id : !!mediaHi.value.url.trim();

    if (!hasEn && !hasHi) {
      if (contentSource.value === 'media' && f.media_asset_id) {
        payload.media_asset_id = f.media_asset_id;
        if (editingContentId.value) payload.url = null;
      } else if (contentSource.value === 'link' && f.url.trim()) {
        payload.url = f.url.trim();
        if (editingContentId.value) payload.media_asset_id = null;
      } else {
        contentError.value = f.type === 'video'
          ? 'Please provide a video (Library asset or Link) for English or Hindi'
          : 'Please provide a PDF (Library asset or Link) for English or Hindi';
        return;
      }
      if (f.type === 'video' && f.duration_minutes > 0) payload.duration_seconds = Math.round(f.duration_minutes * 60);
      payload.language = f.language || 'all';

      busy.value = true;
      contentError.value = '';
      try {
        if (editingContentId.value) {
          await apiPut(`/contents/${editingContentId.value}`, payload);
        } else {
          payload.sort_order = (contents.value[lessonId] || []).length;
          await apiPost(`/lessons/${lessonId}/contents`, payload);
        }
        resetContentForm();
        await loadContents(lessonId);
      } catch (e) {
        contentError.value = errorMessage(e, t('content.contents.saveFailed'));
      } finally {
        busy.value = false;
      }
      return;
    }

    const buildPayload = (cfg: { source: 'media' | 'link'; url: string; media_asset_id: string }, lang: 'en' | 'hi' | 'all') => {
      const p: Record<string, unknown> = { type: f.type, language: lang };
      if (cfg.source === 'media') {
        p.media_asset_id = cfg.media_asset_id;
        p.url = null;
      } else {
        p.url = cfg.url.trim();
        p.media_asset_id = null;
      }
      if (f.type === 'video' && f.duration_minutes > 0) {
        p.duration_seconds = Math.round(f.duration_minutes * 60);
      }
      return p;
    };

    busy.value = true;
    contentError.value = '';
    try {
      if (editingContentId.value) {
        const currentLang = f.language || 'all';
        if (hasEn && hasHi) {
          const primaryCfg = currentLang === 'hi' ? mediaHi.value : mediaEn.value;
          const secondaryCfg = currentLang === 'hi' ? mediaEn.value : mediaHi.value;
          const primaryLang = currentLang === 'hi' ? 'hi' : 'en';
          const secondaryLang = currentLang === 'hi' ? 'en' : 'hi';

          await apiPut(`/contents/${editingContentId.value}`, buildPayload(primaryCfg, primaryLang));

          const siblings = contents.value[lessonId] || [];
          const existingSibling = siblings.find((item) => item.type === f.type && item.language === secondaryLang && item.id !== editingContentId.value);
          if (existingSibling) {
            await apiPut(`/contents/${existingSibling.id}`, buildPayload(secondaryCfg, secondaryLang));
          } else {
            const secondaryPayload = buildPayload(secondaryCfg, secondaryLang);
            secondaryPayload.sort_order = siblings.length + 1;
            await apiPost(`/lessons/${lessonId}/contents`, secondaryPayload);
          }
        } else if (hasHi && !hasEn) {
          await apiPut(`/contents/${editingContentId.value}`, buildPayload(mediaHi.value, 'hi'));
        } else if (hasEn && !hasHi) {
          await apiPut(`/contents/${editingContentId.value}`, buildPayload(mediaEn.value, 'en'));
        }
      } else {
        const existingCount = (contents.value[lessonId] || []).length;
        if (hasEn && hasHi) {
          const enPayload = buildPayload(mediaEn.value, 'en');
          enPayload.sort_order = existingCount;
          await apiPost(`/lessons/${lessonId}/contents`, enPayload);

          const hiPayload = buildPayload(mediaHi.value, 'hi');
          hiPayload.sort_order = existingCount + 1;
          await apiPost(`/lessons/${lessonId}/contents`, hiPayload);
        } else if (hasHi && !hasEn) {
          const hiPayload = buildPayload(mediaHi.value, 'hi');
          hiPayload.sort_order = existingCount;
          await apiPost(`/lessons/${lessonId}/contents`, hiPayload);
        } else if (hasEn && !hasHi) {
          const enPayload = buildPayload(mediaEn.value, 'en');
          enPayload.sort_order = existingCount;
          await apiPost(`/lessons/${lessonId}/contents`, enPayload);
        }
      }

      resetContentForm();
      await loadContents(lessonId);
      return;
    } catch (e) {
      contentError.value = errorMessage(e, t('content.contents.saveFailed'));
      return;
    } finally {
      busy.value = false;
    }
  } else if (f.type === 'scorm') {
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
    if (editingContentId.value) payload.url = null;
  } else {
    const url = f.url.trim();
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
      contentError.value = t('content.contents.urlAbsolute');
      return;
    }
    payload.url = url;
    if (editingContentId.value) payload.media_asset_id = null;
  }

  if (f.type === 'video' && f.duration_minutes > 0) payload.duration_seconds = Math.round(f.duration_minutes * 60);
  payload.language = f.language || 'all';

  busy.value = true;
  contentError.value = '';
  try {
    if (editingContentId.value) {
      await apiPut(`/contents/${editingContentId.value}`, payload);
    } else {
      payload.sort_order = (contents.value[lessonId] || []).length;
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

  if (c.type === 'text') {
    const { en, hi } = splitLessonContent(c.body);
    contentBodyEn.value = en;
    contentBodyHi.value = hi;
    contentBodyLang.value = contentBodyEn.value ? 'en' : 'hi';
  } else {
    contentBodyEn.value = '';
    contentBodyHi.value = '';
  }

  if (c.type === 'video' || c.type === 'pdf') {
    mediaEn.value = { source: 'media', url: '', media_asset_id: '' };
    mediaHi.value = { source: 'media', url: '', media_asset_id: '' };

    if (c.language === 'hi') {
      mediaHi.value = {
        source: c.media_asset_id ? 'media' : 'link',
        url: c.url ?? '',
        media_asset_id: c.media_asset_id ?? '',
      };
      contentMediaLang.value = 'hi';
    } else {
      mediaEn.value = {
        source: c.media_asset_id ? 'media' : 'link',
        url: c.url ?? '',
        media_asset_id: c.media_asset_id ?? '',
      };
      contentMediaLang.value = 'en';
    }

    const siblings = contents.value[openLessonId.value || ''] || [];
    const otherLang = c.language === 'hi' ? 'en' : 'hi';
    const sibling = siblings.find((item) => item.type === c.type && item.language === otherLang && item.id !== c.id);
    if (sibling) {
      if (otherLang === 'en') {
        mediaEn.value = {
          source: sibling.media_asset_id ? 'media' : 'link',
          url: sibling.url ?? '',
          media_asset_id: sibling.media_asset_id ?? '',
        };
      } else {
        mediaHi.value = {
          source: sibling.media_asset_id ? 'media' : 'link',
          url: sibling.url ?? '',
          media_asset_id: sibling.media_asset_id ?? '',
        };
      }
    }
  }

  contentForm.value = {
    type: c.type,
    url: c.url ?? '',
    body: c.body ?? '',
    media_asset_id: c.media_asset_id ?? '',
    scorm_manifest_url: c.scorm_manifest_url ?? '',
    duration_minutes: c.duration_seconds ? Math.round(c.duration_seconds / 60) : 0,
    language: c.language || 'all',
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
 * no ada endpointst reorder khusus untuk content pelajaran, jadi sort_order ditukar
 * lewat dua kali PUT — cukup karena satu pelajaran jarang punya banyak content.
 */
async function moveContent(lessonId: string, id: string, dir: -1 | 1) {
  const list = contents.value[lessonId] || [];
  const idx = list.findIndex((c) => c.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
  busy.value = true;
  contentError.value = '';
  try {
    await apiPut(`/contents/${list[idx].id}`, { sort_order: swapIdx });
    await apiPut(`/contents/${list[swapIdx].id}`, { sort_order: idx });
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
    // Backend otomatis membatasi instructor non-admin to course miliknya sendiri.
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
    sections.value = (res.data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    const entries = await Promise.all(
      sections.value.map(async (s) => {
        const lr = await apiGetFull<Lesson[]>(`/sections/${s.id}/lessons`);
        return [s.id, (lr.data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)] as const;
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
  const en = newSectionTitleEn.value.trim();
  const hi = newSectionTitleHi.value.trim();
  const legacy = newSectionTitle.value.trim();
  const title = (en || hi) ? combineLocalizedText(en, hi, ' / ') : legacy;
  if (!title || !selectedCourseId.value) return;

  busy.value = true;
  try {
    await apiPost(`/courses/${selectedCourseId.value}/sections`, {
      title,
      sort_order: sections.value.length,
    });
    newSectionTitle.value = '';
    newSectionTitleEn.value = '';
    newSectionTitleHi.value = '';
    await loadCurriculum();
    showNotice(t('common.state.saved', 'success ditambahkan!'));
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
  const items = sections.value.map((s, i) => ({ id: s.id, sort_order: i }));
  const tmp = items[idx].sort_order;
  items[idx].sort_order = items[swapIdx].sort_order;
  items[swapIdx].sort_order = tmp;
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
  const en = (newLessonTitleEn.value[sectionId] || '').trim();
  const hi = (newLessonTitleHi.value[sectionId] || '').trim();
  const legacy = (newLessonTitle.value[sectionId] || '').trim();
  const title = (en || hi) ? combineLocalizedText(en, hi, ' / ') : legacy;
  if (!title) return;

  busy.value = true;
  try {
    await apiPost(`/sections/${sectionId}/lessons`, {
      title,
      type: newLessonType.value[sectionId] || 'video',
      sort_order: (lessonsBySection.value[sectionId] || []).length,
    });
    newLessonTitle.value[sectionId] = '';
    newLessonTitleEn.value[sectionId] = '';
    newLessonTitleHi.value[sectionId] = '';
    await loadCurriculum();
    showNotice(t('common.state.saved', 'success ditambahkan!'));
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
  const items = list.map((l, i) => ({ id: l.id, sort_order: i, section_id: sectionId }));
  const tmp = items[idx].sort_order;
  items[idx].sort_order = items[swapIdx].sort_order;
  items[swapIdx].sort_order = tmp;
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
        <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
      </select>
    </div>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="notice" class="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white shadow-xl">
          <Icon name="check-circle" :size="20" />
          {{ notice }}
        </div>
      </Transition>
    </Teleport>

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
            <div class="flex items-center gap-2">
              <h3 class="card-title">{{ getLocalizedText(s.title) }}</h3>
              <span v-if="s.title.includes('/')" class="text-xs text-slate-400">({{ s.title }})</span>
            </div>
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
              <span class="text-slate-800 font-medium">{{ getLocalizedText(l.title) }}</span>
              <span v-if="l.title.includes('/')" class="text-xs text-slate-400">({{ l.title }})</span>
              <span v-if="l.gratis_preview" class="text-[10px] font-medium text-emerald-600">
                {{ t('content.builder.freePreview') }}
              </span>
              <span v-if="l.duration_minutes" class="text-xs text-slate-400">
                {{ fmtAngka(l.duration_minutes) }} {{ t('content.builder.minShort') }}
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
              <!-- Tanpa tombol ini pelajaran hanya berupa title: video, text dan
                   PDF-nya no punya tempat untuk diisi. -->
              <button
                v-can="'content.view'"
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

          <!-- Panel content pelajaran -->
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
                    {{ contentTypeLabel(c.type) }}
                  </span>
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="
                      c.language === 'hi'
                        ? 'bg-emerald-100 text-emerald-800'
                        : c.language === 'en'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-600'
                    "
                  >
                    {{ c.language === 'hi' ? '🇮🇳 हिन्दी' : c.language === 'en' ? '🇬🇧 English' : '🌐 All' }}
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
                  <button v-can="'content.update'" class="btn-outline btn-sm" :disabled="busy" @click="editContent(c)">
                    {{ t('common.action.edit') }}
                  </button>
                  <button
                    v-can="'content.delete'"
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

            <!-- Formulir add / edit content -->
            <div v-can="'content.create'" class="rounded border border-slate-200 bg-white p-3">
              <p class="mb-2 text-xs font-medium text-slate-600">
                {{ editingContentId ? t('content.contents.formEdit') : t('content.contents.formNew') }}
              </p>

              <div class="grid gap-2 sm:grid-cols-2">
                <div v-if="contentForm.type !== 'text' && contentForm.type !== 'video' && contentForm.type !== 'pdf'" class="sm:col-span-2">
                  <label class="label font-medium flex items-center justify-between">
                    <span>Language / भाषा</span>
                    <span class="text-xs font-normal text-slate-500">
                      {{ contentForm.language === 'en' ? 'Only shown to English learners' : contentForm.language === 'hi' ? 'Only shown to Hindi learners' : 'Shown to all learners / fallback' }}
                    </span>
                  </label>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      class="flex items-center justify-center gap-1.5 rounded-lg border py-2 px-3 text-xs font-semibold transition"
                      :class="contentForm.language === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                      @click="contentForm.language = 'all'"
                    >
                      <span>🌐</span> Both / All (Default)
                    </button>
                    <button
                      type="button"
                      class="flex items-center justify-center gap-1.5 rounded-lg border py-2 px-3 text-xs font-semibold transition"
                      :class="contentForm.language === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                      @click="contentForm.language = 'en'"
                    >
                      <span>🇬🇧</span> English Only
                    </button>
                    <button
                      type="button"
                      class="flex items-center justify-center gap-1.5 rounded-lg border py-2 px-3 text-xs font-semibold transition"
                      :class="contentForm.language === 'hi' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                      @click="contentForm.language = 'hi'"
                    >
                      <span>🇮🇳</span> हिन्दी Only (Hindi)
                    </button>
                  </div>
                </div>

                <div class="sm:col-span-2">
                  <label class="label">{{ t('content.contents.type') }}</label>
                  <select v-model="contentForm.type" class="input">
                    <option v-for="ct in CONTENT_TYPES" :key="ct" :value="ct">{{ contentTypeLabel(ct) }}</option>
                  </select>
                </div>

                <!-- Video / PDF Bilingual Tabs (English & Hindi) -->
                <div v-if="isLinkType" class="sm:col-span-2">
                  <div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <label class="label mb-0 font-bold text-slate-800">
                      {{ contentForm.type === 'video' ? 'Video Source (भाषा अनुसार वीडियो)' : 'PDF Document (भाषा अनुसार पीडीएफ)' }}
                    </label>
                    <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all"
                        :class="contentMediaLang === 'en' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
                        @click="contentMediaLang = 'en'"
                      >
                        <span>🇬🇧</span> English {{ contentForm.type === 'video' ? 'Video' : 'PDF' }}
                        <span v-if="(mediaEn.source === 'media' && mediaEn.media_asset_id) || (mediaEn.source === 'link' && mediaEn.url)" class="h-2 w-2 rounded-full bg-emerald-500"></span>
                      </button>
                      <button
                        type="button"
                        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all"
                        :class="contentMediaLang === 'hi' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
                        @click="contentMediaLang = 'hi'"
                      >
                        <span>🇮🇳</span> हिन्दी {{ contentForm.type === 'video' ? 'Video' : 'PDF' }} (Hindi)
                        <span v-if="(mediaHi.source === 'media' && mediaHi.media_asset_id) || (mediaHi.source === 'link' && mediaHi.url)" class="h-2 w-2 rounded-full bg-emerald-500"></span>
                      </button>
                    </div>
                  </div>

                  <!-- English Tab Content -->
                  <div v-show="contentMediaLang === 'en'" class="space-y-3 rounded-xl border border-blue-100 bg-blue-50/20 p-3.5">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold text-blue-800 flex items-center gap-1">
                        <span>🇬🇧</span> English {{ contentForm.type === 'video' ? 'Video' : 'PDF' }} Settings
                      </span>
                      <div class="flex items-center gap-2">
                        <label class="text-xs text-slate-600 font-medium">Source:</label>
                        <select v-model="mediaEn.source" class="input py-1 text-xs w-auto">
                          <option value="media">{{ t('content.contents.sourceMedia') }} (Library)</option>
                          <option value="link">{{ t('content.contents.sourceLink') }} (URL / YouTube)</option>
                        </select>
                      </div>
                    </div>

                    <div v-if="mediaEn.source === 'link'">
                      <label class="label text-xs font-medium">English {{ contentForm.type === 'video' ? 'Video' : 'PDF' }} URL</label>
                      <input v-model="mediaEn.url" class="input" :placeholder="contentForm.type === 'video' ? 'https://youtube.com/watch?v=... or https://...' : 'https://... or /uploads/...'" />
                      <p class="mt-1 text-xs text-slate-400">Direct MP4/PDF link or YouTube embed link for English learners.</p>
                    </div>

                    <div v-else>
                      <label class="label text-xs font-medium">Choose English Asset from Library</label>
                      <select v-model="mediaEn.media_asset_id" class="input">
                        <option value="">{{ t('common.action.choose') }}</option>
                        <option v-for="m in mediaChoices" :key="m.id" :value="m.id">
                          {{ m.file_name }}
                        </option>
                      </select>
                      <div v-can="'content.create'" class="mt-2 flex flex-wrap items-center gap-2">
                        <span class="text-xs text-slate-500">{{ t('content.contents.orUpload') }}</span>
                        <MediaUploadButton :accept="uploadAccept" label="Upload English File" @uploaded="onAssetUploaded" />
                      </div>
                    </div>
                  </div>

                  <!-- Hindi Tab Content -->
                  <div v-show="contentMediaLang === 'hi'" class="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/20 p-3.5">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold text-emerald-800 flex items-center gap-1">
                        <span>🇮🇳</span> हिन्दी {{ contentForm.type === 'video' ? 'Video' : 'PDF' }} Settings (Hindi)
                      </span>
                      <div class="flex items-center gap-2">
                        <label class="text-xs text-slate-600 font-medium">Source:</label>
                        <select v-model="mediaHi.source" class="input py-1 text-xs w-auto">
                          <option value="media">{{ t('content.contents.sourceMedia') }} (Library)</option>
                          <option value="link">{{ t('content.contents.sourceLink') }} (URL / YouTube)</option>
                        </select>
                      </div>
                    </div>

                    <div v-if="mediaHi.source === 'link'">
                      <label class="label text-xs font-medium">हिन्दी {{ contentForm.type === 'video' ? 'Video' : 'PDF' }} URL (Hindi)</label>
                      <input v-model="mediaHi.url" class="input" :placeholder="contentForm.type === 'video' ? 'https://youtube.com/watch?v=... or https://...' : 'https://... or /uploads/...'" />
                      <p class="mt-1 text-xs text-slate-400">हिन्दी भाषा वाले छात्रों के लिए वीडियो या पीडीएफ का लिंक डालें।</p>
                    </div>

                    <div v-else>
                      <label class="label text-xs font-medium">Choose Hindi Asset from Library</label>
                      <select v-model="mediaHi.media_asset_id" class="input">
                        <option value="">{{ t('common.action.choose') }}</option>
                        <option v-for="m in mediaChoices" :key="m.id" :value="m.id">
                          {{ m.file_name }}
                        </option>
                      </select>
                      <div v-can="'content.create'" class="mt-2 flex flex-wrap items-center gap-2">
                        <span class="text-xs text-slate-500">{{ t('content.contents.orUpload') }}</span>
                        <MediaUploadButton :accept="uploadAccept" label="Upload Hindi File" @uploaded="onAssetUploaded" />
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="contentForm.type === 'text'" class="sm:col-span-2">
                  <div class="mb-2 flex items-center justify-between">
                    <label class="label mb-0">{{ t('content.contents.body') }}</label>
                    <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                      <button
                        type="button"
                        class="rounded-md px-2.5 py-1 transition-all"
                        :class="contentBodyLang === 'en' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
                        @click="contentBodyLang = 'en'"
                      >
                        🇬🇧 English Content
                      </button>
                      <button
                        type="button"
                        class="rounded-md px-2.5 py-1 transition-all"
                        :class="contentBodyLang === 'hi' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
                        @click="contentBodyLang = 'hi'"
                      >
                        🇮🇳 हिन्दी Content (Hindi)
                      </button>
                    </div>
                  </div>

                  <div v-show="contentBodyLang === 'en'">
                    <RichTextEditor v-model="contentBodyEn" />
                    <p class="mt-1 text-xs text-slate-400">English lesson text / explanation / notes.</p>
                  </div>
                  <div v-show="contentBodyLang === 'hi'">
                    <RichTextEditor v-model="contentBodyHi" />
                    <p class="mt-1 text-xs text-slate-400">हिन्दी पाठ सामग्री / व्याख्या (Hindi lesson content).</p>
                  </div>
                </div>

                <div v-if="contentForm.type === 'scorm'" class="sm:col-span-2">
                  <label class="label">{{ t('content.contents.manifest') }}</label>
                  <input v-model="contentForm.scorm_manifest_url" class="input" placeholder="https://…/imsmanifest.xml" />
                </div>

                <div v-if="contentForm.type === 'video'">
                  <label class="label">{{ t('content.contents.duration') }}</label>
                  <input v-model.number="contentForm.duration_minutes" type="number" min="0" class="input" />
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

        <div v-can="'kurikulum.create'" class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <div class="flex flex-1 min-w-[280px] gap-2">
            <input
              v-model="newLessonTitleEn[s.id]"
              class="input text-xs flex-1"
              placeholder="Lesson title (English)"
              @keyup.enter="addLesson(s.id)"
            />
            <input
              v-model="newLessonTitleHi[s.id]"
              class="input text-xs flex-1"
              placeholder="पाठ का शीर्षक (हिन्दी)"
              @keyup.enter="addLesson(s.id)"
            />
          </div>
          <button class="btn-outline btn-sm shrink-0" :disabled="busy" @click="addLesson(s.id)">+ {{ t('content.builder.addLesson') }}</button>
        </div>
      </div>

      <div v-can="'kurikulum.create'" class="card p-4">
        <h4 class="text-sm font-semibold text-slate-800 mb-2">+ {{ t('content.builder.addSection') }}</h4>
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="newSectionTitleEn"
            class="input flex-1 min-w-[200px]"
            placeholder="Section Title (English)"
            @keyup.enter="addSection"
          />
          <input
            v-model="newSectionTitleHi"
            class="input flex-1 min-w-[200px]"
            placeholder="सेक्शन शीर्षक (हिन्दी)"
            @keyup.enter="addSection"
          />
          <button class="btn-primary" :disabled="busy" @click="addSection">{{ t('content.builder.addSection') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
