<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';

interface AttemptOption {
  id: string;
  teks: string;
}
interface AttemptQuestion {
  id: string;
  teks: string;
  // Sesuai enum BE: pilihan_tunggal | pilihan_ganda | benar_salah | isian_singkat | esai | upload_file | pencocokan
  tipe: string;
  opsi?: AttemptOption[];
}
interface Attempt {
  id: string;
  status: string;
  remainingSeconds?: number;
  questions: AttemptQuestion[];
}

/** Bentuk respons BE POST /quizzes/:id/attempts */
interface StartAttemptResponse {
  attempt: { id: string; status: string; waktu_tersisa_detik: number | null };
  soal: Array<{
    question_id: string;
    tipe: string;
    teks_soal: string;
    opsi?: Array<{ id: string; teks_opsi: string }>;
  }>;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const quizId = route.params.quizId as string;

const attempt = ref<Attempt | null>(null);
const loading = ref(true);
const error = ref('');
const submitting = ref(false);
const showConfirm = ref(false);
const showNav = ref(false);

const answers = reactive<Record<string, unknown>>({});
const flagged = ref<Set<string>>(new Set());
const currentIndex = ref(0);
const remaining = ref(0);
const timed = ref(false); // kuis punya batas waktu? bila tidak, timer & auto-submit dimatikan.
const autosaveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');

let tickHandle: number | undefined;
const saveTimers: Record<string, number> = {};

const questions = computed(() => attempt.value?.questions ?? []);
const currentQuestion = computed(() => questions.value[currentIndex.value] ?? null);
const answeredCount = computed(() => Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== '').length);
const unansweredCount = computed(() => questions.value.length - answeredCount.value);
const progressPercent = computed(() => (questions.value.length ? Math.round((answeredCount.value / questions.value.length) * 100) : 0));

function fmtTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function questionStatus(id: string) {
  if (flagged.value.has(id)) return 'flag';
  const v = answers[id];
  return v !== undefined && v !== '' ? 'answered' : 'unanswered';
}

async function startAttempt() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiPost<StartAttemptResponse>(`/quizzes/${quizId}/attempts`, {});
    attempt.value = {
      id: res.attempt.id,
      status: res.attempt.status,
      remainingSeconds: res.attempt.waktu_tersisa_detik ?? 0,
      questions: (res.soal ?? []).map((s) => ({
        id: s.question_id,
        teks: s.teks_soal,
        tipe: s.tipe,
        opsi: (s.opsi ?? []).map((o) => ({ id: o.id, teks: o.teks_opsi })),
      })),
    };
    remaining.value = attempt.value.remainingSeconds ?? 0;
    timed.value = remaining.value > 0;
    if (timed.value) tickHandle = window.setInterval(tick, 1000); // kuis tanpa batas waktu tak di-countdown
  } catch (e) {
    error.value = errorMessage(e, t('assessments.attempt.startFailed'));
  } finally {
    loading.value = false;
  }
}

function tick() {
  if (remaining.value <= 0) {
    if (tickHandle) window.clearInterval(tickHandle);
    submit(true);
    return;
  }
  remaining.value -= 1;
}

function setAnswer(questionId: string, value: unknown) {
  answers[questionId] = value;
  autosaveStatus.value = 'saving';
  if (saveTimers[questionId]) window.clearTimeout(saveTimers[questionId]);
  saveTimers[questionId] = window.setTimeout(() => persistAnswer(questionId), 800);
}

/** Bungkus nilai UI jadi bentuk `jawaban` yang dipahami auto-grading BE. */
function encodeJawaban(tipe: string, val: unknown): Record<string, unknown> {
  switch (tipe) {
    case 'pilihan_tunggal':
    case 'benar_salah':
      return { option_id: val ?? null };
    case 'pilihan_ganda':
      return { option_ids: Array.isArray(val) ? val : [] };
    case 'isian_singkat':
    case 'esai':
      return { teks: typeof val === 'string' ? val : '' };
    case 'upload_file':
      return { nama_file: typeof val === 'string' ? val : '' };
    default:
      return { teks: typeof val === 'string' ? val : String(val ?? '') };
  }
}

async function persistAnswer(questionId: string) {
  if (!attempt.value) return;
  const q = questions.value.find((x) => x.id === questionId);
  try {
    await apiPut(`/attempts/${attempt.value.id}/answers`, {
      question_id: questionId,
      jawaban: encodeJawaban(q?.tipe ?? '', answers[questionId]),
    });
    autosaveStatus.value = 'saved';
  } catch {
    autosaveStatus.value = 'error';
  }
}

function toggleFlag(id: string) {
  if (flagged.value.has(id)) flagged.value.delete(id);
  else flagged.value.add(id);
  flagged.value = new Set(flagged.value);
}

function goTo(i: number) {
  if (i < 0 || i >= questions.value.length) return;
  currentIndex.value = i;
  showNav.value = false;
}

async function submit(auto = false) {
  if (!attempt.value || submitting.value) return;
  if (!auto && !showConfirm.value) {
    showConfirm.value = true;
    return;
  }
  submitting.value = true;
  try {
    await apiPost(`/attempts/${attempt.value.id}/submit`, {});
    if (tickHandle) window.clearInterval(tickHandle);
    router.push({ name: 'assessments' });
  } catch (e) {
    error.value = errorMessage(e, t('assessments.attempt.submitFailed'));
  } finally {
    submitting.value = false;
    showConfirm.value = false;
  }
}

onMounted(startAttempt);
onBeforeUnmount(() => {
  if (tickHandle) window.clearInterval(tickHandle);
});
</script>

<template>
  <div>
    <div v-if="loading" class="text-slate-400">{{ t('assessments.attempt.loading') }}</div>
    <div v-else-if="error && !attempt" class="card p-6 text-slate-500">
      {{ error }}
      <RouterLink :to="{ name: 'assessments' }" class="mt-2 block font-medium text-brand-700">
        {{ t('assessments.attempt.back') }}
      </RouterLink>
    </div>

    <div v-else-if="attempt">
      <!-- Header: timer + progress -->
      <div class="card mb-4 flex flex-wrap items-center justify-between gap-2 p-3">
        <div class="flex items-center gap-2">
          <span
            class="rounded-lg px-3 py-1.5 font-mono text-lg font-bold"
            :class="timed && remaining <= 60 ? 'bg-rose-100 text-rose-700' : 'bg-brand-50 text-brand-800'"
          >
            ⏱ {{ timed ? fmtTime(remaining) : t('assessments.attempt.noTimeLimit') }}
          </span>
          <span class="text-xs text-slate-400">
            {{
              autosaveStatus === 'saving'
                ? t('assessments.attempt.saving')
                : autosaveStatus === 'saved'
                  ? t('assessments.attempt.saved')
                  : autosaveStatus === 'error'
                    ? t('assessments.attempt.saveError')
                    : ''
            }}
          </span>
        </div>
        <button class="btn-outline lg:hidden" @click="showNav = !showNav">
          {{ t('assessments.attempt.questionMap', { answered: fmtAngka(answeredCount), total: fmtAngka(questions.length) }) }}
        </button>
        <div class="hidden text-sm text-slate-500 lg:block">
          {{ t('assessments.attempt.answeredOf', { answered: fmtAngka(answeredCount), total: fmtAngka(questions.length) }) }}
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[1fr,16rem]">
        <!-- Soal aktif -->
        <div v-if="currentQuestion" class="card p-4">
          <div class="mb-3 flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {{ t('assessments.attempt.questionN', { n: fmtAngka(currentIndex + 1), total: fmtAngka(questions.length) }) }}
            </span>
            <button class="text-xs font-medium" :class="flagged.has(currentQuestion.id) ? 'text-amber-600' : 'text-slate-400'" @click="toggleFlag(currentQuestion.id)">
              {{ flagged.has(currentQuestion.id) ? t('assessments.attempt.flagged') : t('assessments.attempt.flag') }}
            </button>
          </div>
          <p class="text-base text-slate-800">{{ currentQuestion.teks }}</p>

          <div class="mt-4 space-y-2">
            <template v-if="currentQuestion.tipe === 'pilihan_tunggal' || currentQuestion.tipe === 'benar_salah'">
              <label v-for="o in currentQuestion.opsi || []" :key="o.id" class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                <input
                  type="radio"
                  :name="currentQuestion.id"
                  :checked="answers[currentQuestion.id] === o.id"
                  @change="setAnswer(currentQuestion.id, o.id)"
                />
                {{ o.teks }}
              </label>
            </template>

            <template v-else-if="currentQuestion.tipe === 'pilihan_ganda'">
              <label v-for="o in currentQuestion.opsi || []" :key="o.id" class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  :checked="Array.isArray(answers[currentQuestion.id]) && (answers[currentQuestion.id] as string[]).includes(o.id)"
                  @change="
                    setAnswer(
                      currentQuestion.id,
                      (($event.target as HTMLInputElement).checked
                        ? [...((answers[currentQuestion.id] as string[]) || []), o.id]
                        : ((answers[currentQuestion.id] as string[]) || []).filter((x) => x !== o.id)),
                    )
                  "
                />
                {{ o.teks }}
              </label>
            </template>

            <input
              v-else-if="currentQuestion.tipe === 'isian_singkat'"
              class="input"
              :value="(answers[currentQuestion.id] as string) || ''"
              :placeholder="t('assessments.attempt.shortAnswerPlaceholder')"
              @input="setAnswer(currentQuestion.id, ($event.target as HTMLInputElement).value)"
            />

            <textarea
              v-else-if="currentQuestion.tipe === 'esai'"
              class="input"
              rows="6"
              :placeholder="t('assessments.attempt.essayPlaceholder')"
              :value="(answers[currentQuestion.id] as string) || ''"
              @input="setAnswer(currentQuestion.id, ($event.target as HTMLTextAreaElement).value)"
            ></textarea>

            <input
              v-else-if="currentQuestion.tipe === 'upload_file'"
              type="file"
              class="input"
              @change="setAnswer(currentQuestion.id, (($event.target as HTMLInputElement).files?.[0]?.name) || '')"
            />

            <p v-else class="text-sm text-slate-400">{{ t('assessments.attempt.unsupportedType', { type: currentQuestion.tipe }) }}</p>
          </div>

          <div class="mt-6 flex justify-between">
            <button class="btn-outline" :disabled="currentIndex === 0" @click="goTo(currentIndex - 1)">
              {{ t('assessments.attempt.prev') }}
            </button>
            <button v-if="currentIndex < questions.length - 1" class="btn-outline" @click="goTo(currentIndex + 1)">
              {{ t('assessments.attempt.next') }}
            </button>
            <button v-else class="btn-primary" @click="submit()">{{ t('assessments.attempt.submit') }}</button>
          </div>
        </div>
        <div v-else class="empty-state">{{ t('assessments.attempt.noQuestions') }}</div>

        <!-- Peta navigasi soal -->
        <aside class="card p-4" :class="showNav ? 'block' : 'hidden lg:block'">
          <h3 class="text-sm font-medium text-slate-800">{{ t('assessments.attempt.mapTitle') }}</h3>
          <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-brand-600" :style="{ width: `${progressPercent}%` }"></div>
          </div>
          <div class="mt-3 grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            <button
              v-for="(q, i) in questions"
              :key="q.id"
              class="grid h-8 w-8 place-items-center rounded-lg text-xs font-medium"
              :class="[
                i === currentIndex ? 'ring-2 ring-brand-600' : '',
                questionStatus(q.id) === 'answered' ? 'bg-emerald-100 text-emerald-700' : questionStatus(q.id) === 'flag' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
              ]"
              @click="goTo(i)"
            >
              {{ fmtAngka(i + 1) }}
            </button>
          </div>
          <p class="mt-3 text-xs text-slate-400">{{ t('assessments.attempt.unanswered', { n: fmtAngka(unansweredCount) }) }}</p>
          <button class="btn-primary mt-3 w-full" @click="submit()">{{ t('assessments.attempt.submitQuiz') }}</button>
        </aside>
      </div>

      <!-- Konfirmasi submit -->
      <div v-if="showConfirm" class="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
        <div class="card w-full max-w-sm p-5">
          <h3 class="card-title">{{ t('assessments.attempt.confirmTitle') }}</h3>
          <p class="mt-2 text-sm text-slate-500">
            {{ t('assessments.attempt.confirmBody', { answered: fmtAngka(answeredCount), total: fmtAngka(questions.length) }) }}
            <span v-if="unansweredCount">{{ t('assessments.attempt.confirmBlank', { n: fmtAngka(unansweredCount) }) }}</span>
          </p>
          <div v-if="error" class="mt-2 alert-error">{{ error }}</div>
          <div class="mt-4 flex justify-end gap-2">
            <button class="btn-outline" @click="showConfirm = false">{{ t('common.action.cancel') }}</button>
            <button class="btn-primary" :disabled="submitting" @click="submit()">
              {{ submitting ? t('assessments.list.sending') : t('assessments.attempt.confirmYes') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
