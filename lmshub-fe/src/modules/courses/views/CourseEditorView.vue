<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPost, apiPut, errorMessage, assetUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useCurrencyStore } from '@/stores/currency';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import RichTextEditor from '@/components/ui/RichTextEditor.vue';
import MediaUploadButton from '@/components/ui/MediaUploadButton.vue';

interface CourseDetail {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  category_id: string;
  level: string;
  price: string;
  strike_price: string | null;
  language: string;
  publication_status: string;
  instructor_nama?: string | null;
  final_exam_quiz_id?: string | null;
  allow_restart?: boolean;
  thumbnail_media_id?: string | null;
  meta?: { thumbnail_url?: string } | null;
}
interface QuizOption {
  id: string;
  title: string;
  passing_score: string | null;
  max_attempts: number;
  is_active: boolean;
}
interface Category {
  id: string;
  name: string;
}

const STATUS_CHAIN = ['draf', 'dalam_review', 'terbit', 'diperbarui', 'diarsip'];

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const courseId = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => !!courseId.value);
const tab = ref<'info' | 'kurikulum' | 'kelulusan'>(route.query.tab === 'completion' ? 'kelulusan' : 'info');

const form = reactive({
  title: '',
  slug: '',
  category_id: '',
  level: 'pemula' as 'pemula' | 'menengah' | 'mahir',
  price: 0,
  strike_price: undefined as number | undefined,
  summary: '',
  description: '',
  language: 'id',
  thumbnail_media_id: undefined as string | undefined,
});

const currentStatus = ref('draf');
const instructorNama = ref('');
const categories = ref<Category[]>([]);
const canManageCategories = useAuthStore().can('kategori.create');
// Harga disimpan dalam mata uang basis, bukan Rupiah. Labelnya dulu menuliskan
// "(IDR)" secara harfiah di keempat berkas terjemahan, jadi pemasangan yang
// memakai mata uang lain melihat kolom price yang salah namanya.
const currency = useCurrencyStore();
const loading = ref(true);
const saving = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const previewUrl = ref('');

/**
 * Kegagalan di sini sengaja tidak membatalkan pemuatan halaman — editor tetap
 * berguna untuk menyunting course yang sudah ada. Tapi daftar yang kosong
 * berarti `category_id` (wajib) tidak bisa diisi, jadi templatenya menjelaskan
 * hal itu di bawah dropdown alih-alih membiarkannya kosong tanpa sebab.
 */
async function loadCategories() {
  try {
    categories.value = await apiGetFull<Category[]>('/categories', { limit: 100 }).then((r) => r.data ?? []);
  } catch {
    categories.value = [];
  }
}

async function loadCourse(id: string) {
  const c = await apiGet<CourseDetail>(`/courses/${id}`);
  form.title = c.title;
  form.slug = c.slug;
  form.category_id = c.category_id;
  form.level = c.level as typeof form.level;
  form.price = Number(c.price);
  form.strike_price = c.strike_price ? Number(c.strike_price) : undefined;
  form.summary = c.summary ?? '';
  form.description = c.description ?? '';
  form.language = c.language;
  currentStatus.value = c.publication_status;
  instructorNama.value = c.instructor_nama ?? '';
  form.thumbnail_media_id = c.thumbnail_media_id ?? undefined;
  previewUrl.value = c.meta?.thumbnail_url ? assetUrl(c.meta.thumbnail_url) : '';
  rules.final_exam_quiz_id = c.final_exam_quiz_id ?? '';
  rules.allow_restart = !!c.allow_restart;
}

// ── Kelulusan & certificate ───────────────────────────────────────────────
// Disimpan lewat endpoint tersendiri: mengubah aturan kelulusan tidak boleh
// memindahkan course Terbit ke "Diperbarui" dan menunggu review ulang.
const rules = reactive({ final_exam_quiz_id: '', allow_restart: false });
const quizzes = ref<QuizOption[]>([]);
const savingRules = ref(false);
const selectedExam = computed(() => quizzes.value.find((q) => q.id === rules.final_exam_quiz_id) ?? null);

async function loadQuizzes(id: string) {
  try {
    quizzes.value = (await apiGetFull<QuizOption[]>('/quizzes', { 'filter[course_id]': id }).then((r) => r.data ?? [])) as QuizOption[];
  } catch {
    quizzes.value = [];
  }
}

async function saveRules() {
  if (!courseId.value) return;
  savingRules.value = true;
  error.value = '';
  notice.value = '';
  try {
    await apiPut(`/courses/${courseId.value}/completion-rules`, {
      final_exam_quiz_id: rules.final_exam_quiz_id || null,
      allow_restart: rules.allow_restart,
    });
    notice.value = t('courses.completion.saved');
  } catch (e) {
    error.value = errorMessage(e, t('courses.completion.saveFailed'));
  } finally {
    savingRules.value = false;
  }
}

onMounted(async () => {
  loading.value = true;
  error.value = '';
  try {
    await loadCategories();
    if (courseId.value) await Promise.all([loadCourse(courseId.value), loadQuizzes(courseId.value)]);
    else if (categories.value.length) form.category_id = categories.value[0].id;
  } catch (e) {
    error.value = errorMessage(e, t('courses.editor.loadFailed'));
  } finally {
    loading.value = false;
  }
});

async function submit() {
  error.value = '';
  saving.value = true;
  try {
    const payload = {
      title: form.title,
      slug: form.slug || undefined,
      category_id: form.category_id,
      level: form.level,
      price: Number(form.price),
      strike_price: form.strike_price ? Number(form.strike_price) : undefined,
      summary: form.summary || undefined,
      description: form.description || undefined,
      language: form.language,
      thumbnail_media_id: form.thumbnail_media_id || undefined,
    };
    if (isEdit.value && courseId.value) {
      await apiPut(`/courses/${courseId.value}`, payload);
      notice.value = t('courses.editor.saved');
    } else {
      const created = await apiPost<{ id: string }>('/courses', payload);
      router.push(`/d/courses/${created.id}`);
      return;
    }
  } catch (e) {
    error.value = errorMessage(e, t('courses.editor.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function transition(action: 'submit' | 'publish' | 'archive') {
  if (!courseId.value) return;
  busy.value = true;
  error.value = '';
  try {
    await apiPost(`/courses/${courseId.value}/${action}`, {});
    await loadCourse(courseId.value);
  } catch (e) {
    error.value = errorMessage(e, t('courses.editor.statusFailed'));
  } finally {
    busy.value = false;
  }
}

function onThumbnailUploaded(asset: { id: string; path_object_storage?: string }) {
  form.thumbnail_media_id = asset.id;
  if (asset.path_object_storage) {
    previewUrl.value = assetUrl(asset.path_object_storage);
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="isEdit ? form.title || t('courses.editor.titleEdit') : t('courses.editor.titleNew')"
      :subtitle="t('courses.editor.subtitle')"
    >
      <template #actions>
        <StatusChip v-if="isEdit" :status="currentStatus" />
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <template v-else>
      <div v-if="isEdit" class="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <template v-for="(s, i) in STATUS_CHAIN" :key="s">
          <span :class="s === currentStatus ? 'font-semibold text-brand-700' : ''">{{ t(`courses.status.${s}`) }}</span>
          <span v-if="i < STATUS_CHAIN.length - 1">──</span>
        </template>
      </div>

      <div v-if="isEdit" class="tab-bar mb-4">
        <button
          class="tab-item"
          :class="{ 'tab-item-active': tab === 'info' }"
          @click="tab = 'info'"
        >
          {{ t('courses.editor.tabInfo') }}
        </button>
        <button
          class="tab-item"
          :class="{ 'tab-item-active': tab === 'kurikulum' }"
          @click="tab = 'kurikulum'"
        >
          {{ t('courses.editor.tabCurriculum') }}
        </button>
        <button
          class="tab-item"
          :class="{ 'tab-item-active': tab === 'kelulusan' }"
          @click="tab = 'kelulusan'"
        >
          {{ t('courses.completion.tab') }}
        </button>
      </div>

      <p v-if="error" class="mb-4 alert-error">{{ error }}</p>
      <p v-if="notice" class="mb-4 alert-success">{{ notice }}</p>

      <div v-if="tab === 'info'" class="space-y-6">
        <form class="card grid gap-4 p-5 sm:grid-cols-2" @submit.prevent="submit">
          <div class="sm:col-span-2">
            <label class="label">{{ t('courses.editor.fieldTitle') }}</label>
            <input v-model="form.title" class="input" required :placeholder="t('courses.editor.fieldTitlePlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldSlug') }}</label>
            <input v-model="form.slug" class="input" :placeholder="t('courses.editor.fieldSlugPlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldCategory') }}</label>
            <select v-model="form.category_id" class="input" required>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <!-- Tautan hanya untuk yang boleh membuat kategori; sisanya diarahkan
                 ke admin, bukan ke halaman yang akan menolak mereka. -->
            <p v-if="!loading && !categories.length" class="mt-1 text-xs text-amber-600">
              <template v-if="canManageCategories">
                {{ t('courses.editor.noCategory') }}
                <RouterLink :to="{ name: 'categories' }" class="underline">
                  {{ t('courses.editor.noCategoryLink') }}
                </RouterLink>
              </template>
              <template v-else>{{ t('courses.editor.noCategoryAskAdmin') }}</template>
            </p>
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldLevel') }}</label>
            <select v-model="form.level" class="input">
              <option value="pemula">{{ t('common.level.pemula') }}</option>
              <option value="menengah">{{ t('common.level.menengah') }}</option>
              <option value="mahir">{{ t('common.level.mahir') }}</option>
            </select>
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldLanguage') }}</label>
            <input v-model="form.language" class="input" maxlength="10" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldPrice', { currency: currency.base }) }}</label>
            <input v-model.number="form.price" class="input" type="number" min="0" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldStrikePrice') }}</label>
            <input v-model.number="form.strike_price" class="input" type="number" min="0" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('courses.editor.fieldSummary') }}</label>
            <textarea v-model="form.summary" class="input" rows="2" maxlength="500"></textarea>
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('courses.editor.fieldDescription') }}</label>
            <RichTextEditor v-model="form.description" class="mt-1" />
          </div>
          <div v-if="isEdit" class="text-xs text-slate-400 sm:col-span-2">
            {{ t('courses.editor.instructor', { name: instructorNama || '—' }) }}
          </div>

          <div class="sm:col-span-2 border-t border-slate-100 pt-4">
            <label class="label">Course Thumbnail (Optional)</label>
            <div class="flex items-center gap-3">
              <img v-if="previewUrl" :src="previewUrl" class="h-16 w-24 object-cover rounded-lg border border-slate-200" alt="Thumbnail Preview" />
              <MediaUploadButton
                accept="image/jpeg,image/png,image/webp"
                label="Upload New Thumbnail"
                @uploaded="onThumbnailUploaded"
              />
              <span v-if="form.thumbnail_media_id" class="text-sm font-medium text-green-600">
                Thumbnail selected!
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-1">Upload a cover image for your course. It will automatically be selected.</p>
          </div>

          <div class="flex flex-wrap gap-2 sm:col-span-2">
            <button class="btn-primary" type="submit" :disabled="saving">
              {{ saving ? t('common.state.saving') : t('common.action.save') }}
            </button>
            <RouterLink to="/d/courses" class="btn-outline">{{ t('common.action.cancel') }}</RouterLink>
          </div>
        </form>

        <div v-if="isEdit" class="card flex flex-wrap gap-2 p-5">
          <button
            v-if="currentStatus === 'draf'"
            v-can="'course.update'"
            class="btn-outline"
            :disabled="busy"
            @click="transition('submit')"
          >
            {{ t('courses.list.submitReview') }}
          </button>
          <button
            v-if="['dalam_review', 'diperbarui'].includes(currentStatus)"
            v-can="'course.update'"
            class="btn-outline"
            :disabled="busy"
            @click="transition('publish')"
          >
            {{ t('courses.editor.approvePublish') }}
          </button>
          <button
            v-if="currentStatus !== 'diarsip'"
            v-can="'course.update'"
            class="btn-outline"
            :disabled="busy"
            @click="transition('archive')"
          >
            {{ t('courses.list.archive') }}
          </button>
        </div>
      </div>

      <div v-else-if="tab === 'kelulusan' && isEdit && courseId" class="card space-y-5 p-5">
        <div>
          <h3 class="section-title">{{ t('courses.completion.title') }}</h3>
          <p class="mt-1 text-sm text-slate-500">{{ t('courses.completion.intro') }}</p>
        </div>

        <div>
          <label class="label" for="final-exam">{{ t('courses.completion.finalExam') }}</label>
          <select id="final-exam" v-model="rules.final_exam_quiz_id" class="input max-w-lg">
            <option value="">{{ t('courses.completion.noExam') }}</option>
            <option v-for="q in quizzes" :key="q.id" :value="q.id">
              {{ q.title }}{{ q.is_active ? '' : ` (${t('courses.completion.inactive')})` }}
            </option>
          </select>
          <p class="mt-1 text-xs text-slate-400">{{ t('courses.completion.finalExamHint') }}</p>
          <p v-if="selectedExam" class="mt-2 text-sm text-slate-600">
            {{
              t('courses.completion.examSummary', {
                pass: selectedExam.passing_score != null ? Number(selectedExam.passing_score) : t('courses.completion.defaultPass'),
                attempts: selectedExam.max_attempts ? selectedExam.max_attempts : t('courses.completion.unlimited'),
              })
            }}
            <RouterLink :to="{ name: 'quiz-edit', params: { id: selectedExam.id } }" class="ms-1 font-medium text-brand-600 hover:underline">
              {{ t('courses.completion.editExam') }}
            </RouterLink>
          </p>
          <p v-if="!quizzes.length" class="mt-2 text-sm text-slate-500">
            {{ t('courses.completion.noQuizzes') }}
            <RouterLink :to="{ name: 'quiz-create', query: { course: courseId } }" class="ms-1 font-medium text-brand-600 hover:underline">
              {{ t('courses.completion.createExam') }}
            </RouterLink>
          </p>
        </div>

        <div>
          <label class="label-inline">
            <input v-model="rules.allow_restart" type="checkbox" /> {{ t('courses.completion.allowRestart') }}
          </label>
          <p class="ms-6 mt-1 text-xs text-slate-400">{{ t('courses.completion.allowRestartHint') }}</p>
        </div>

        <p class="rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">{{ t('courses.completion.globalHint') }}</p>

        <div>
          <button v-can="'course.update'" class="btn-primary" :disabled="savingRules" @click="saveRules">
            {{ savingRules ? t('common.state.saving') : t('common.action.save') }}
          </button>
        </div>
      </div>

      <div v-else-if="isEdit && courseId" class="card space-y-3 p-5">
        <p class="text-sm text-slate-500">{{ t('courses.editor.curriculumHint') }}</p>
        <div class="flex flex-wrap gap-2">
          <RouterLink :to="`/d/curriculum?courseId=${courseId}`" class="btn-primary">{{ t('courses.editor.openBuilder') }}</RouterLink>
          <RouterLink :to="`/d/media?courseId=${courseId}`" class="btn-outline">{{ t('courses.editor.openMedia') }}</RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>
