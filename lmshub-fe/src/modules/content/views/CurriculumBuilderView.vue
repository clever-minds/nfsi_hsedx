<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';

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
          <li
            v-for="(l, li) in lessonsBySection[s.id] || []"
            :key="l.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
          >
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
              <button v-can="'kurikulum.delete'" class="btn-outline px-2 py-0.5 text-xs text-rose-600" :disabled="busy" @click="removeLesson(l.id)">
                {{ t('common.action.delete') }}
              </button>
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
