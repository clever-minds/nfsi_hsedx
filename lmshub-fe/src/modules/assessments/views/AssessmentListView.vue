<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtPersen, fmtTanggal } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import DataTable from '@/components/ui/DataTable.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useCourseOptions } from '../useCourseOptions';

interface QuestionBank extends Record<string, unknown> {
  id: string;
  name: string;
  course_title?: string;
  jumlah_soal?: number;
}
interface Quiz extends Record<string, unknown> {
  id: string;
  title: string;
  course_title?: string;
  course_id?: string;
  batas_waktu_menit?: number;
  max_attempts?: number;
  passing_score?: string | number;
  total_points?: string | number;
  is_active?: boolean;
  // Diisi BE untuk student: status & nilai attempt miliknya.
  attempt_status?: string;
  best_score?: string | null;
  used_attempts?: number;
  /** Ujian akhir kursusnya — membuka certificate. */
  is_ujian_akhir?: boolean;
  retry_delay_minutes?: number;
  // Dihitung BE untuk student dengan aturan yang sama dengan saat mulai mengerjakan.
  passing_score_val?: number;
  skor_terbaik_persen?: number | null;
  sisa_percobaan?: number | null;
  can_start?: boolean;
  can_retry_at?: string | null;
}
interface Assignment extends Record<string, unknown> {
  id: string;
  title: string;
  course_title?: string;
  due_at?: string;
  submission_type?: string;
  instructions?: string;
  is_active?: boolean;
  // Diisi BE untuk student: status submission miliknya.
  submission_status?: string;
}

const auth = useAuthStore();
const { t, te } = useI18n();
// Bank soal = area pengelola (instructor/admin). Student hanya melihat quiz & assignment untuk dikerjakan.
const isPengelola = auth.can('bank_soal.view');
const route = useRoute();
const initialTab = route.query.tab;
const tab = ref<'bank' | 'quiz' | 'assignment'>(
  initialTab === 'bank' && isPengelola ? 'bank' : initialTab === 'assignment' ? 'assignment' : 'quiz',
);
const { courses, load: loadCourses } = useCourseOptions();

// ── Bank Soal ──
const banks = ref<QuestionBank[]>([]);
const banksLoading = ref(true);
const banksError = ref('');
const bankColumns = computed(() => [
  { key: 'name', label: t('assessments.list.colBank') },
  { key: 'course_title', label: t('assessments.list.colBankCourse') },
  { key: 'jumlah_soal', label: t('assessments.list.colQuestionCount') },
]);
const showBankForm = ref(false);
const bankForm = reactive({ name: '', courseId: '' });
const bankSubmitting = ref(false);
const bankFormError = ref('');

async function loadBanks() {
  banksLoading.value = true;
  banksError.value = '';
  try {
    const res = await apiGetFull<QuestionBank[]>('/question-banks');
    banks.value = res.data ?? [];
  } catch (e) {
    banksError.value = errorMessage(e, t('assessments.list.bankLoadFailed'));
    banks.value = [];
  } finally {
    banksLoading.value = false;
  }
}

async function submitBank() {
  if (!bankForm.name.trim()) {
    bankFormError.value = t('assessments.list.bankNameRequired');
    return;
  }
  if (!bankForm.courseId) {
    bankFormError.value = t('assessments.list.courseRequired');
    return;
  }
  bankSubmitting.value = true;
  bankFormError.value = '';
  try {
    await apiPost('/question-banks', { name: bankForm.name.trim(), course_id: bankForm.courseId });
    showBankForm.value = false;
    bankForm.name = '';
    bankForm.courseId = '';
    await loadBanks();
  } catch (e) {
    bankFormError.value = errorMessage(e, t('assessments.list.bankCreateFailed'));
  } finally {
    bankSubmitting.value = false;
  }
}

// ── Quiz ──
const quizzes = ref<Quiz[]>([]);
const quizzesLoading = ref(true);
const quizzesError = ref('');
const quizColumns = computed(() => [
  { key: 'title', label: t('assessments.list.colQuiz') },
  { key: 'course_title', label: t('assessments.list.colCourse') },
  { key: 'batas_waktu_menit', label: t('assessments.list.colTimeLimit') },
  { key: 'max_attempts', label: t('assessments.list.colMaxAttempts') },
  { key: 'passing_score', label: t('assessments.list.colPassingScore') },
  { key: 'status', label: t('assessments.list.colStatus') },
]);

// ── Status & aksi quiz (khusus student) ──
function quizStatusText(q: Quiz): string {
  const s = q.attempt_status;
  if (!s || s === 'belum' || s === 'belum_dikerjakan') return t('assessments.list.quizStatus.notStarted');
  if (s === 'sedang') return t('assessments.list.quizStatus.inProgress');
  if (s === 'dikumpulkan') return t('assessments.list.quizStatus.awaitingGrading');
  if (s === 'dinilai') {
    const skor = Number(q.best_score ?? 0);
    const total = Number(q.total_points ?? 0);
    const pct = q.skor_terbaik_persen ?? (total ? Math.round((skor / total) * 100) : 0);
    const passing = q.passing_score_val ?? (q.passing_score != null ? Number(q.passing_score) : null);
    const lulus = passing != null ? pct >= passing : null;
    const base = t('assessments.list.quizStatus.scored', {
      score: fmtAngka(skor),
      total: fmtAngka(total),
      percent: fmtAngka(pct),
    });
    if (lulus === null) return base;
    return base + t(lulus ? 'assessments.list.quizStatus.passed' : 'assessments.list.quizStatus.failed');
  }
  return s;
}
function quizStatusClass(q: Quiz): string {
  const s = q.attempt_status;
  if (s === 'dinilai') {
    const pct = q.skor_terbaik_persen ?? (Number(q.total_points) ? (Number(q.best_score ?? 0) / Number(q.total_points)) * 100 : 0);
    const passing = q.passing_score_val ?? (q.passing_score != null ? Number(q.passing_score) : null);
    const lulus = passing != null ? pct >= passing : true;
    return lulus ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  }
  if (s === 'sedang' || s === 'dikumpulkan') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}
/** Boleh mulai sekarang? BE menghitungnya (batas + jeda); backend lama tanpa field itu → hitung batas saja. */
function bolehMulai(q: Quiz): boolean {
  if (q.can_start !== undefined) return q.can_start;
  const maks = q.max_attempts ?? 1;
  return maks === 0 || (q.used_attempts ?? 0) < maks;
}
/** "2/3×" atau "2×" untuk quiz tanpa batas. */
function attemptLabel(q: Quiz): string {
  return q.max_attempts ? `${q.used_attempts ?? 0}/${q.max_attempts}×` : `${q.used_attempts ?? 0}×`;
}

async function loadQuizzes() {
  quizzesLoading.value = true;
  quizzesError.value = '';
  try {
    const res = await apiGetFull<Quiz[]>('/quizzes');
    quizzes.value = res.data ?? [];
  } catch (e) {
    quizzesError.value = errorMessage(e, t('assessments.list.quizLoadFailed'));
    quizzes.value = [];
  } finally {
    quizzesLoading.value = false;
  }
}

// ── Assignment ──
const assignments = ref<Assignment[]>([]);
const assignmentsLoading = ref(true);
const assignmentsError = ref('');
const assignmentColumns = computed(() => [
  { key: 'title', label: t('assessments.list.colAssignment') },
  { key: 'course_title', label: t('assessments.list.colCourse') },
  { key: 'due_at', label: t('assessments.list.colDueDate') },
  { key: 'submission_type', label: t('assessments.list.colSubmissionType') },
  { key: 'status', label: t('assessments.list.colStatus') },
]);

/** Label tipe pengumpulan (`file` | `tautan` | `text`) dari catalog i18n. */
function submissionTypeLabel(tipe?: string): string {
  if (tipe === 'tautan' || tipe === 'url') return t('assessments.list.typeLink');
  if (tipe === 'text') return t('assessments.list.typeText');
  if (tipe === 'file') return t('assessments.list.typeFile');
  return tipe || '—';
}

// ── Status & aksi assignment (khusus student) ──
function assignmentStatusText(a: Assignment): string {
  const s = a.submission_status ?? 'belum';
  const key = `assessments.list.submissionStatus.${s}`;
  return te(key) ? t(key) : s;
}
function assignmentStatusClass(a: Assignment): string {
  const s = a.submission_status;
  if (s === 'dinilai') return 'bg-emerald-100 text-emerald-700';
  if (s === 'dikumpulkan') return 'bg-amber-100 text-amber-700';
  if (s === 'revisi_diminta') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-500';
}
function canSubmit(a: Assignment): boolean {
  const s = a.submission_status ?? 'belum';
  return s === 'belum' || s === 'revisi_diminta';
}

// Modal pengumpulan assignment student
const submitTarget = ref<Assignment | null>(null);
const submitForm = reactive({ isi_teks: '', url: '' });
const submitBusy = ref(false);
const submitError = ref('');

function openSubmit(a: Assignment) {
  submitTarget.value = a;
  submitForm.isi_teks = '';
  submitForm.url = '';
  submitError.value = '';
}

async function kirimSubmission() {
  if (!submitTarget.value) return;
  const tipe = submitTarget.value.submission_type;
  if ((tipe === 'tautan' || tipe === 'url') && !submitForm.url.trim()) {
    submitError.value = t('assessments.list.linkRequired');
    return;
  }
  if (tipe === 'text' && !submitForm.isi_teks.trim()) {
    submitError.value = t('assessments.list.textRequired');
    return;
  }
  submitBusy.value = true;
  submitError.value = '';
  try {
    await apiPost(`/assignments/${submitTarget.value.id}/submissions`, {
      isi_teks: submitForm.isi_teks.trim() || null,
      url: submitForm.url.trim() || null,
    });
    submitTarget.value = null;
    await loadAssignments();
  } catch (e) {
    submitError.value = errorMessage(e, t('assessments.list.submitFailed'));
  } finally {
    submitBusy.value = false;
  }
}
const showAssignmentForm = ref(false);
const assignmentForm = reactive({ title: '', courseId: '', tenggat: '', tipePengumpulan: 'file', instructions: '' });
const assignmentSubmitting = ref(false);
const assignmentFormError = ref('');

async function loadAssignments() {
  assignmentsLoading.value = true;
  assignmentsError.value = '';
  try {
    const res = await apiGetFull<Assignment[]>('/assignments');
    assignments.value = res.data ?? [];
  } catch (e) {
    assignmentsError.value = errorMessage(e, t('assessments.list.assignmentLoadFailed'));
    assignments.value = [];
  } finally {
    assignmentsLoading.value = false;
  }
}

async function submitAssignment() {
  if (assignmentForm.title.trim().length < 2 || !assignmentForm.courseId || !assignmentForm.instructions.trim()) {
    assignmentFormError.value = t('assessments.list.assignmentRequired');
    return;
  }
  assignmentSubmitting.value = true;
  assignmentFormError.value = '';
  try {
    // Nama field mengikuti backend; "tautan" di UI = `url` di backend.
    await apiPost('/assignments', {
      title: assignmentForm.title.trim(),
      course_id: assignmentForm.courseId,
      due_at: assignmentForm.tenggat ? new Date(assignmentForm.tenggat).toISOString() : null,
      submission_type: assignmentForm.tipePengumpulan === 'tautan' ? 'url' : assignmentForm.tipePengumpulan,
      instructions: assignmentForm.instructions.trim(),
    });
    showAssignmentForm.value = false;
    assignmentForm.title = '';
    assignmentForm.courseId = '';
    assignmentForm.tenggat = '';
    assignmentForm.instructions = '';
    await loadAssignments();
  } catch (e) {
    assignmentFormError.value = errorMessage(e, t('assessments.list.assignmentCreateFailed'));
  } finally {
    assignmentSubmitting.value = false;
  }
}

function switchTab(next: 'bank' | 'quiz' | 'assignment') {
  tab.value = next;
}

onMounted(() => {
  if (isPengelola) {
    loadBanks(); // hindari 403 bank_soal.view untuk student
    loadCourses();
  }
  loadQuizzes();
  loadAssignments();
});
</script>

<template>
  <div>
    <PageHeader
      :title="isPengelola ? t('assessments.list.titleManager') : t('assessments.list.titleStudent')"
      :subtitle="isPengelola ? t('assessments.list.subtitleManager') : t('assessments.list.subtitleStudent')"
    >
      <template v-if="isPengelola" #actions>
        <button v-if="tab === 'bank'" class="btn-primary" @click="showBankForm = !showBankForm">
          {{ showBankForm ? t('assessments.list.close') : t('assessments.list.newBank') }}
        </button>
        <RouterLink v-else-if="tab === 'quiz'" :to="{ name: 'quiz-create' }" class="btn-primary">
          {{ t('assessments.list.createQuiz') }}
        </RouterLink>
        <button v-else class="btn-primary" @click="showAssignmentForm = !showAssignmentForm">
          {{ showAssignmentForm ? t('assessments.list.close') : t('assessments.list.createAssignment') }}
        </button>
      </template>
    </PageHeader>

    <div class="tab-bar mb-4">
      <button v-if="isPengelola" class="tab-item" :class="{ 'tab-item-active': tab === 'bank' }" @click="switchTab('bank')">
        {{ t('assessments.list.tabBank') }}
      </button>
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'quiz' }" @click="switchTab('quiz')">
        {{ t('assessments.list.tabQuiz') }}
      </button>
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'assignment' }" @click="switchTab('assignment')">
        {{ t('assessments.list.tabAssignment') }}
      </button>
    </div>

    <!-- Bank Soal -->
    <div v-if="tab === 'bank'">
      <div v-if="showBankForm" class="card mb-4 p-4">
        <div v-if="bankFormError" class="mb-2 alert-error">{{ bankFormError }}</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">{{ t('assessments.list.bankName') }}</label>
            <input v-model="bankForm.name" class="input" :placeholder="t('assessments.list.bankNamePlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('assessments.list.bankCourse') }}</label>
            <select v-model="bankForm.courseId" class="input">
              <option value="">{{ t('assessments.list.pickCourse') }}</option>
              <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button class="btn-outline" @click="showBankForm = false">{{ t('common.action.cancel') }}</button>
          <button class="btn-primary" :disabled="bankSubmitting" @click="submitBank">
            {{ bankSubmitting ? t('common.state.saving') : t('common.action.save') }}
          </button>
        </div>
      </div>
      <div v-if="banksError" class="mb-4 alert-error">{{ banksError }}</div>
      <DataTable :columns="bankColumns" :rows="banks" :loading="banksLoading" :empty="t('assessments.list.bankEmpty')">
        <template #cell:jumlah_soal="{ value }">{{ t('assessments.list.questionsCount', { n: fmtAngka((value as number) ?? 0) }) }}</template>
        <template #actions="{ row }">
          <RouterLink :to="{ name: 'question-bank', params: { id: (row as QuestionBank).id } }" class="row-link row-link-primary">
            {{ t('assessments.list.manageQuestions') }}
          </RouterLink>
        </template>
      </DataTable>
    </div>

    <!-- Quiz -->
    <div v-else-if="tab === 'quiz'">
      <div v-if="quizzesError" class="mb-4 alert-error">{{ quizzesError }}</div>
      <DataTable :columns="quizColumns" :rows="quizzes" :loading="quizzesLoading" :empty="t('assessments.list.quizEmpty')">
        <template #cell:title="{ row }">
          <span>{{ (row as Quiz).title }}</span>
          <span v-if="(row as Quiz).is_ujian_akhir" class="ms-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
            {{ t('assessments.list.finalExam') }}
          </span>
        </template>
        <template #cell:max_attempts="{ value }">{{ value === 0 ? t('assessments.list.unlimited') : value }}</template>
        <template #cell:passing_score="{ row, value }">
          {{ value != null ? fmtPersen(Number(value)) : (row as Quiz).passing_score_val != null ? fmtPersen(Number((row as Quiz).passing_score_val)) : '—' }}
        </template>
        <template #cell:status="{ row }">
          <!-- Pengelola: status aktif/nonaktif quiz. Student: status pengerjaan miliknya. -->
          <StatusChip v-if="isPengelola" :status="(row as Quiz).is_active ? 'aktif' : 'nonaktif'" />
          <span v-else class="inline-block rounded-full px-2.5 py-1 text-xs font-medium" :class="quizStatusClass(row as Quiz)">
            {{ quizStatusText(row as Quiz) }}
          </span>
        </template>
        <template #actions="{ row }">
          <div class="flex items-center justify-end gap-3">
            <RouterLink v-if="isPengelola" :to="{ name: 'quiz-edit', params: { id: (row as Quiz).id } }" class="row-link row-link-primary">
              {{ t('assessments.list.edit') }}
            </RouterLink>
            <template v-else>
              <RouterLink
                v-if="bolehMulai(row as Quiz)"
                :to="{ name: 'quiz-attempt', params: { quizId: (row as Quiz).id } }"
                class="btn-primary btn-sm"
              >
                {{ (row as Quiz).used_attempts ? t('assessments.list.retake') : t('assessments.list.take') }}
              </RouterLink>
              <span v-else-if="(row as Quiz).can_retry_at" class="text-xs font-medium text-amber-600">
                {{ t('assessments.list.retakeAfter', { time: fmtTanggal((row as Quiz).can_retry_at!) }) }}
              </span>
              <span v-else class="text-xs font-medium text-slate-400">{{ t('assessments.list.noAttemptsLeft') }}</span>
              <span v-if="(row as Quiz).used_attempts" class="num text-xs text-slate-400">
                {{ attemptLabel(row as Quiz) }}
              </span>
            </template>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- Assignment -->
    <div v-else>
      <div v-if="showAssignmentForm" class="card mb-4 p-4">
        <div v-if="assignmentFormError" class="mb-2 alert-error">{{ assignmentFormError }}</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">{{ t('assessments.list.assignmentTitle') }}</label>
            <input v-model="assignmentForm.title" class="input" />
          </div>
          <div>
            <label class="label">{{ t('assessments.list.assignmentCourse') }}</label>
            <select v-model="assignmentForm.courseId" class="input">
              <option value="">{{ t('assessments.list.pickCourse') }}</option>
              <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>
          <div>
            <label class="label">{{ t('assessments.list.dueDate') }}</label>
            <input v-model="assignmentForm.tenggat" type="datetime-local" class="input" />
          </div>
          <div>
            <label class="label">{{ t('assessments.list.submissionType') }}</label>
            <select v-model="assignmentForm.tipePengumpulan" class="input">
              <option value="file">{{ t('assessments.list.typeFile') }}</option>
              <option value="tautan">{{ t('assessments.list.typeLink') }}</option>
              <option value="text">{{ t('assessments.list.typeText') }}</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('assessments.list.instructions') }}</label>
            <textarea v-model="assignmentForm.instructions" class="input" rows="3"></textarea>
          </div>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button class="btn-outline" @click="showAssignmentForm = false">{{ t('common.action.cancel') }}</button>
          <button class="btn-primary" :disabled="assignmentSubmitting" @click="submitAssignment">
            {{ assignmentSubmitting ? t('common.state.saving') : t('common.action.save') }}
          </button>
        </div>
      </div>
      <div v-if="assignmentsError" class="mb-4 alert-error">{{ assignmentsError }}</div>
      <DataTable :columns="assignmentColumns" :rows="assignments" :loading="assignmentsLoading" :empty="t('assessments.list.assignmentEmpty')">
        <template #cell:due_at="{ value }">{{ value ? fmtTanggal(String(value)) : '—' }}</template>
        <template #cell:submission_type="{ value }">{{ submissionTypeLabel(value as string) }}</template>
        <template #cell:status="{ row }">
          <StatusChip v-if="isPengelola" :status="(row as Assignment).is_active ? 'aktif' : 'nonaktif'" />
          <span v-else class="inline-block rounded-full px-2.5 py-1 text-xs font-medium" :class="assignmentStatusClass(row as Assignment)">
            {{ assignmentStatusText(row as Assignment) }}
          </span>
        </template>
        <template #actions="{ row }">
          <div v-if="!isPengelola" class="flex justify-end">
            <button
              v-if="canSubmit(row as Assignment)"
              class="btn-primary btn-sm"
              @click="openSubmit(row as Assignment)"
            >
              {{ (row as Assignment).submission_status === 'revisi_diminta' ? t('assessments.list.revise') : t('assessments.list.submit') }}
            </button>
            <span v-else class="text-xs font-medium text-slate-400">{{ t('assessments.list.submitted') }}</span>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- Modal kumpulkan assignment (student) -->
    <div v-if="submitTarget" class="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
      <div class="card w-full max-w-lg p-5">
        <h3 class="card-title">{{ t('assessments.list.submitTitle', { title: submitTarget.title }) }}</h3>
        <p v-if="submitTarget.instructions" class="mt-1 whitespace-pre-line text-sm text-slate-500">{{ submitTarget.instructions }}</p>
        <p class="mt-1 text-xs text-slate-400">
          {{ t('assessments.list.submitTypeLabel') }}
          <span class="font-medium">{{ submissionTypeLabel(submitTarget.submission_type) }}</span>
        </p>

        <div v-if="submitError" class="mt-3 alert-error">{{ submitError }}</div>

        <div class="mt-4 space-y-3">
          <div v-if="submitTarget.submission_type === 'tautan' || submitTarget.submission_type === 'url'">
            <label class="label">{{ t('assessments.list.linkLabel') }}</label>
            <input v-model="submitForm.url" class="input" placeholder="https://…" />
          </div>
          <div v-else-if="submitTarget.submission_type === 'file'">
            <label class="label">{{ t('assessments.list.fileLinkLabel') }}</label>
            <input v-model="submitForm.url" class="input" :placeholder="t('assessments.list.fileLinkPlaceholder')" />
            <p class="mt-1 text-xs text-slate-400">{{ t('assessments.list.fileHint') }}</p>
          </div>
          <div>
            <label class="label">
              {{
                submitTarget.submission_type === 'text'
                  ? t('assessments.list.textLabel')
                  : t('assessments.list.textLabelOptional')
              }}
            </label>
            <textarea v-model="submitForm.isi_teks" class="input" rows="4" :placeholder="t('assessments.list.textPlaceholder')"></textarea>
          </div>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-outline" @click="submitTarget = null">{{ t('common.action.cancel') }}</button>
          <button class="btn-primary" :disabled="submitBusy" @click="kirimSubmission">
            {{ submitBusy ? t('assessments.list.sending') : t('assessments.list.submit') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
