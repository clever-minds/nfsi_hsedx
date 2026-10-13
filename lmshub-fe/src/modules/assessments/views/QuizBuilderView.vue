<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useCourseOptions } from '../useCourseOptions';

/**
 * Buat/edit quiz atau exam.
 *
 * Versi previous mengirim field camelCase (`kursusId`, `attemptMaks`, …)
 * yang no dikenal backend, sehingga setiap save ditolak; soal yang dipilih
 * juga no pernah dikirim. Kini name field mengikuti API, soal disimpan lewat
 * `PUT /quizzes/:id/questions`, dan quiz bisa langsung ditetapkan sebagai
 * exam akhir kursusnya.
 */
interface QuestionBank {
  id: string;
  name: string;
  course_id: string | null;
}
interface QuestionSummary {
  id: string;
  question_text: string;
  type: string;
  points: string | number;
}
interface QuizDetail {
  id: string;
  title: string;
  description: string | null;
  course_id: string;
  time_limit_minutes: number | null;
  randomize_questions: boolean;
  randomize_options: boolean;
  max_attempts: number;
  retry_delay_minutes: number;
  passing_score: string | null;
  show_answers_after_completion: boolean;
  is_active: boolean;
  is_final_exam?: boolean;
  questions?: Array<{ question_id: string; sort_order: number }>;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const quizId = computed(() => (route.params.id as string) || '');
const isEdit = computed(() => !!quizId.value && route.name === 'quiz-edit');
const { courses, load: loadCourses } = useCourseOptions();

const loading = ref(false);
const error = ref('');
const saving = ref(false);

const form = reactive({
  title: '',
  description: '',
  courseId: (route.query.course as string) || '',
  /** 0 / kosong = tanpa batas time. */
  batasWaktuMenit: 20 as number | null,
  acakSoal: true,
  acakOpsi: true,
  /** 0 = tanpa batas percobaan. */
  attemptMaks: 1,
  jedaUlangMenit: 0,
  passingScore: 70 as number | null,
  tampilkanJawaban: false,
  isAktif: true,
  finalExam: false,
});
/** Apakah quiz ini previous exam akhir — supaya mencentang ulang/melepas hanya mengirim yang perlu. */
const wasFinal = ref(false);

const banks = ref<QuestionBank[]>([]);
const banksLoading = ref(false);
const selectedBankId = ref('');
const questions = ref<QuestionSummary[]>([]);
const questionsLoading = ref(false);
/** Urutan pilih = sort_order soal di quiz. */
const selectedQuestionIds = ref<string[]>([]);

const banksForCourse = computed(() => banks.value.filter((b) => !form.courseId || b.course_id === form.courseId));

async function loadBanks() {
  banksLoading.value = true;
  try {
    banks.value = (await apiGet<QuestionBank[]>('/question-banks').catch(() => [])) ?? [];
  } finally {
    banksLoading.value = false;
  }
}

async function loadQuestions(bankId: string) {
  if (!bankId) {
    questions.value = [];
    return;
  }
  questionsLoading.value = true;
  try {
    questions.value = (await apiGet<QuestionSummary[]>(`/question-banks/${bankId}/questions`).catch(() => [])) ?? [];
  } finally {
    questionsLoading.value = false;
  }
}
watch(selectedBankId, (v) => loadQuestions(v));
watch(
  () => form.courseId,
  () => {
    if (selectedBankId.value && !banksForCourse.value.some((b) => b.id === selectedBankId.value)) selectedBankId.value = '';
  },
);

function toggleQuestion(id: string) {
  const i = selectedQuestionIds.value.indexOf(id);
  if (i >= 0) selectedQuestionIds.value.splice(i, 1);
  else selectedQuestionIds.value.push(id);
}

const questionSearch = ref('');

const filteredQuestions = computed(() => {
  const q = questionSearch.value.trim().toLowerCase();
  if (!q) return questions.value;
  return questions.value.filter(
    (item) => item.question_text.toLowerCase().includes(q) || item.type.toLowerCase().includes(q),
  );
});

const isAllSelected = computed(() => {
  if (!questions.value.length) return false;
  return questions.value.every((q) => selectedQuestionIds.value.includes(q.id));
});

const isPartiallySelected = computed(() => {
  if (!questions.value.length) return false;
  const some = questions.value.some((q) => selectedQuestionIds.value.includes(q.id));
  return some && !isAllSelected.value;
});

const selectedInBankCount = computed(() => {
  const currentBankIds = new Set(questions.value.map((q) => q.id));
  return selectedQuestionIds.value.filter((id) => currentBankIds.has(id)).length;
});

function toggleSelectAll() {
  const target = filteredQuestions.value.length ? filteredQuestions.value : questions.value;
  if (!target.length) return;

  const allTargetSelected = target.every((q) => selectedQuestionIds.value.includes(q.id));

  if (allTargetSelected) {
    const targetIds = new Set(target.map((q) => q.id));
    selectedQuestionIds.value = selectedQuestionIds.value.filter((id) => !targetIds.has(id));
  } else {
    const current = new Set(selectedQuestionIds.value);
    for (const q of target) {
      if (!current.has(q.id)) {
        selectedQuestionIds.value.push(q.id);
        current.add(q.id);
      }
    }
  }
}

function selectAllQuestions() {
  const current = new Set(selectedQuestionIds.value);
  for (const q of questions.value) {
    if (!current.has(q.id)) {
      selectedQuestionIds.value.push(q.id);
      current.add(q.id);
    }
  }
}

function clearAllQuestionsInBank() {
  const bankIds = new Set(questions.value.map((q) => q.id));
  selectedQuestionIds.value = selectedQuestionIds.value.filter((id) => !bankIds.has(id));
}

function clearAllSelected() {
  selectedQuestionIds.value = [];
}

async function loadQuiz() {
  if (!isEdit.value) return;
  loading.value = true;
  error.value = '';
  try {
    const q = await apiGet<QuizDetail>(`/quizzes/${quizId.value}`);
    Object.assign(form, {
      title: q.title,
      description: q.description ?? '',
      courseId: q.course_id,
      batasWaktuMenit: q.time_limit_minutes,
      acakSoal: q.randomize_questions,
      acakOpsi: q.randomize_options,
      attemptMaks: q.max_attempts,
      jedaUlangMenit: q.retry_delay_minutes ?? 0,
      passingScore: q.passing_score === null ? null : Number(q.passing_score),
      tampilkanJawaban: q.show_answers_after_completion,
      isAktif: q.is_active,
      finalExam: !!q.is_final_exam,
    });
    wasFinal.value = !!q.is_final_exam;
    selectedQuestionIds.value = (q.questions ?? []).sort((a, b) => a.sort_order - b.sort_order).map((x) => x.question_id);
  } catch (e) {
    error.value = errorMessage(e, t('assessments.builder.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save() {
  error.value = '';
  if (form.title.trim().length < 2 || !form.courseId) {
    error.value = t('assessments.builder.required');
    return;
  }
  if (!selectedQuestionIds.value.length) {
    error.value = t('assessments.builder.needQuestions');
    return;
  }
  saving.value = true;
  const payload = {
    title: form.title.trim(),
    description: form.description.trim() || null,
    time_limit_minutes: form.batasWaktuMenit && form.batasWaktuMenit > 0 ? form.batasWaktuMenit : null,
    randomize_questions: form.acakSoal,
    randomize_options: form.acakOpsi,
    max_attempts: Math.max(0, Number(form.attemptMaks) || 0),
    retry_delay_minutes: Math.max(0, Number(form.jedaUlangMenit) || 0),
    passing_score: form.passingScore === null || (form.passingScore as unknown) === '' ? null : Number(form.passingScore),
    show_answers_after_completion: form.tampilkanJawaban,
    is_active: form.isAktif,
  };
  try {
    const quiz = isEdit.value
      ? await apiPut<{ id: string }>(`/quizzes/${quizId.value}`, payload)
      : await apiPost<{ id: string }>('/quizzes', { ...payload, course_id: form.courseId });
    await apiPut(`/quizzes/${quiz.id}/questions`, {
      questions: selectedQuestionIds.value.map((id, i) => ({ question_id: id, sort_order: i })),
    });
    if (form.finalExam !== wasFinal.value) {
      // Melepas centang hanya mengosongkan bila quiz ini memang exam akhirnya.
      await apiPut(`/courses/${form.courseId}/completion-rules`, { final_exam_quiz_id: form.finalExam ? quiz.id : null });
    }
    router.push({ name: 'assessments' });
  } catch (e) {
    error.value = errorMessage(e, t('assessments.builder.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadCourses();
  loadBanks();
  loadQuiz();
});
</script>

<template>
  <div>
    <PageHeader
      :title="isEdit ? t('assessments.builder.titleEdit') : t('assessments.builder.titleNew')"
      :subtitle="t('assessments.builder.subtitle')"
    >
      <template #actions>
        <RouterLink :to="{ name: 'assessments' }" class="btn-outline">{{ t('assessments.builder.back') }}</RouterLink>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <div v-else class="grid gap-4 lg:grid-cols-3">
      <div class="card p-4 lg:col-span-2">
        <div v-if="error" class="mb-3 alert-error">{{ error }}</div>
        <h3 class="card-title">{{ t('assessments.builder.settings') }}</h3>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label" for="quiz-title">{{ t('assessments.builder.quizTitle') }}</label>
            <input id="quiz-title" v-model="form.title" class="input" :placeholder="t('assessments.builder.quizTitlePlaceholder')" />
          </div>
          <div class="sm:col-span-2">
            <label class="label" for="quiz-course">{{ t('assessments.builder.course') }}</label>
            <select id="quiz-course" v-model="form.courseId" class="input" :disabled="isEdit">
              <option value="">{{ t('assessments.list.pickCourse') }}</option>
              <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label" for="quiz-desc">{{ t('assessments.builder.description') }}</label>
            <textarea id="quiz-desc" v-model="form.description" rows="2" class="input"></textarea>
          </div>
          <div>
            <label class="label" for="quiz-time">{{ t('assessments.builder.timeLimit') }}</label>
            <input id="quiz-time" v-model.number="form.batasWaktuMenit" type="number" min="0" class="input" />
            <p class="mt-1 text-xs text-slate-400">{{ t('assessments.builder.timeLimitHint') }}</p>
          </div>
          <div>
            <label class="label" for="quiz-pass">{{ t('assessments.builder.passingScore') }}</label>
            <input id="quiz-pass" v-model.number="form.passingScore" type="number" min="0" max="100" class="input" />
            <p class="mt-1 text-xs text-slate-400">{{ t('assessments.builder.passingScoreHint') }}</p>
          </div>
          <div>
            <label class="label" for="quiz-attempts">{{ t('assessments.builder.maxAttempts') }}</label>
            <input id="quiz-attempts" v-model.number="form.attemptMaks" type="number" min="0" class="input" />
            <p class="mt-1 text-xs text-slate-400">{{ t('assessments.builder.maxAttemptsHint') }}</p>
          </div>
          <div>
            <label class="label" for="quiz-cooldown">{{ t('assessments.builder.cooldown') }}</label>
            <input id="quiz-cooldown" v-model.number="form.jedaUlangMenit" type="number" min="0" class="input" />
            <p class="mt-1 text-xs text-slate-400">{{ t('assessments.builder.cooldownHint') }}</p>
          </div>
          <div class="flex flex-col gap-2 sm:col-span-2">
            <label class="label-inline">
              <input v-model="form.finalExam" type="checkbox" :disabled="!form.courseId" /> {{ t('assessments.builder.finalExam') }}
            </label>
            <p class="-mt-1 ms-6 text-xs text-slate-400">{{ t('assessments.builder.finalExamHint') }}</p>
            <label class="label-inline">
              <input v-model="form.isAktif" type="checkbox" /> {{ t('assessments.builder.active') }}
            </label>
            <label class="label-inline">
              <input v-model="form.acakSoal" type="checkbox" /> {{ t('assessments.builder.shuffleQuestions') }}
            </label>
            <label class="label-inline">
              <input v-model="form.acakOpsi" type="checkbox" /> {{ t('assessments.builder.shuffleOptions') }}
            </label>
            <label class="label-inline">
              <input v-model="form.tampilkanJawaban" type="checkbox" /> {{ t('assessments.builder.showAnswers') }}
            </label>
          </div>
        </div>

        <h3 class="mt-6 font-medium text-slate-800">{{ t('assessments.builder.pickQuestions') }}</h3>
        <div class="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label class="label" for="quiz-bank">{{ t('assessments.builder.questionBank') }}</label>
            <select id="quiz-bank" v-model="selectedBankId" class="input max-w-sm" :disabled="banksLoading">
              <option value="">{{ t('assessments.builder.pickBank') }}</option>
              <option v-for="b in banksForCourse" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>
          <RouterLink
            v-if="selectedBankId"
            :to="{ name: 'question-bank', params: { id: selectedBankId } }"
            class="btn-outline btn-sm mb-1"
          >
            {{ t('assessments.list.manageQuestions') }}
          </RouterLink>
        </div>
        <div v-if="questionsLoading" class="mt-3 text-sm text-slate-400">{{ t('assessments.builder.loadingQuestions') }}</div>
        <div v-else-if="questions.length" class="mt-3 space-y-2">
          <!-- Toolbar Select All & Search -->
          <div class="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50/90 p-2.5">
            <label class="flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                :checked="isAllSelected"
                :indeterminate.prop="isPartiallySelected"
                @change="toggleSelectAll"
              />
              <span class="text-sm font-semibold text-slate-800">
                {{ isAllSelected ? t('assessments.builder.deselectAll') : t('assessments.builder.selectAll', { n: fmtAngka(questions.length) }) }}
              </span>
              <span class="rounded bg-white px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                {{ t('assessments.builder.selectedCount', { selected: fmtAngka(selectedInBankCount), total: fmtAngka(questions.length) }) }}
              </span>
            </label>

            <div class="flex flex-wrap items-center gap-2">
              <input
                v-model="questionSearch"
                type="text"
                class="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                :placeholder="t('assessments.builder.searchPlaceholder')"
              />
              <button
                type="button"
                class="btn-outline btn-xs cursor-pointer"
                :disabled="selectedInBankCount === questions.length"
                @click="selectAllQuestions"
              >
                {{ t('assessments.builder.btnSelectAll') }}
              </button>
              <button
                type="button"
                class="btn-outline btn-xs text-slate-500 hover:text-rose-600 cursor-pointer"
                :disabled="selectedInBankCount === 0"
                @click="clearAllQuestionsInBank"
              >
                {{ t('assessments.builder.btnClearAll') }}
              </button>
            </div>
          </div>

          <!-- Questions List -->
          <ul v-if="filteredQuestions.length" class="max-h-96 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-1">
            <li
              v-for="q in filteredQuestions"
              :key="q.id"
              class="flex items-center gap-2 rounded-lg px-2.5 py-2 transition hover:bg-slate-50"
              :class="{ 'bg-brand-50/50': selectedQuestionIds.includes(q.id) }"
            >
              <input
                :id="`q-${q.id}`"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                :checked="selectedQuestionIds.includes(q.id)"
                @change="toggleQuestion(q.id)"
              />
              <label :for="`q-${q.id}`" class="flex-1 cursor-pointer text-sm text-slate-700 select-none">
                {{ q.question_text }}
              </label>
              <span class="shrink-0 text-xs text-slate-400">
                {{ t(`assessments.bank.type.${q.type}`) }} · {{ fmtAngka(Number(q.points)) }}
              </span>
            </li>
          </ul>
          <p v-else class="py-4 text-center text-xs text-slate-400">
            {{ t('assessments.builder.noMatchingQuestions') }}
          </p>
        </div>
        <p v-else-if="selectedBankId" class="mt-3 text-sm text-slate-400">{{ t('assessments.builder.bankEmpty') }}</p>
        <p v-else class="mt-3 text-sm text-slate-400">{{ t('assessments.builder.pickBankFirst') }}</p>
      </div>

      <aside class="card h-fit p-4">
        <h3 class="card-title">{{ t('assessments.builder.summary') }}</h3>
        <div class="mt-2 flex items-center justify-between">
          <p class="text-sm text-slate-500">
            {{ t('assessments.builder.selectedQuestions', { n: fmtAngka(selectedQuestionIds.length) }) }}
          </p>
          <button
            v-if="selectedQuestionIds.length > 0"
            type="button"
            class="text-xs text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
            @click="clearAllSelected"
          >
            {{ t('assessments.builder.clearAllSelected') }}
          </button>
        </div>
        <p class="mt-1 text-sm text-slate-500">
          {{
            form.passingScore === null || (form.passingScore as unknown) === ''
              ? t('assessments.builder.summaryPassingDefault')
              : t('assessments.builder.summaryPassing', { n: fmtAngka(form.passingScore) })
          }}
        </p>
        <p class="mt-1 text-sm text-slate-500">
          {{ form.batasWaktuMenit ? t('assessments.builder.summaryTime', { n: fmtAngka(form.batasWaktuMenit) }) : t('assessments.builder.summaryNoTime') }}
        </p>
        <p class="mt-1 text-sm text-slate-500">
          {{ form.attemptMaks ? t('assessments.builder.summaryAttempts', { n: fmtAngka(form.attemptMaks) }) : t('assessments.builder.summaryUnlimited') }}
        </p>
        <p v-if="form.finalExam" class="mt-2 rounded bg-brand-50 px-2 py-1.5 text-xs text-brand-700">{{ t('assessments.builder.summaryFinal') }}</p>
        <button class="btn-primary mt-4 w-full" :disabled="saving" @click="save">
          {{ saving ? t('common.state.saving') : t('assessments.builder.save') }}
        </button>
      </aside>
    </div>
  </div>
</template>
