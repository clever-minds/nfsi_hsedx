<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, errorMessage } from '@/lib/api';
import { fmtAngka, fmtPersen, fmtTanggal } from '@/lib/format';
import DataTable from '@/components/ui/DataTable.vue';

const props = defineProps<{ courseId: string }>();

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
  attempt_status?: string;
  best_score?: string | null;
  used_attempts?: number;
  is_ujian_akhir?: boolean;
  retry_delay_minutes?: number;
  passing_score_val?: number;
  skor_terbaik_persen?: number | null;
  sisa_percobaan?: number | null;
  can_start?: boolean;
  can_retry_at?: string | null;
}

interface Assignment extends Record<string, unknown> {
  id: string;
  title: string;
  course_id?: string;
  due_at?: string;
  submission_type?: string;
  instructions?: string;
  is_active?: boolean;
  submission_status?: string;
}

const { t, te } = useI18n();
const tab = ref<'quiz' | 'assignment'>('quiz');

const quizzes = ref<Quiz[]>([]);
const quizzesLoading = ref(true);
const quizzesError = ref('');

const assignments = ref<Assignment[]>([]);
const assignmentsLoading = ref(true);
const assignmentsError = ref('');

const quizColumns = computed(() => [
  { key: 'title', label: t('assessments.list.colQuiz') },
  { key: 'batas_waktu_menit', label: t('assessments.list.colTimeLimit') },
  { key: 'max_attempts', label: t('assessments.list.colMaxAttempts') },
  { key: 'passing_score', label: t('assessments.list.colPassingScore') },
  { key: 'status', label: t('assessments.list.colStatus') },
]);

const assignmentColumns = computed(() => [
  { key: 'title', label: t('assessments.list.colAssignment') },
  { key: 'due_at', label: t('assessments.list.colDueDate') },
  { key: 'submission_type', label: t('assessments.list.colSubmissionType') },
  { key: 'status', label: t('assessments.list.colStatus') },
]);

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

function submissionTypeLabel(tipe?: string): string {
  if (tipe === 'tautan' || tipe === 'url') return t('assessments.list.typeLink');
  if (tipe === 'text') return t('assessments.list.typeText');
  if (tipe === 'file') return t('assessments.list.typeFile');
  return tipe || '—';
}

function bolehMulai(q: Quiz): boolean {
  if (q.can_start !== undefined) return q.can_start;
  const maks = q.max_attempts ?? 1;
  return maks === 0 || (q.used_attempts ?? 0) < maks;
}

function attemptLabel(q: Quiz): string {
  return q.max_attempts ? `${q.used_attempts ?? 0}/${q.max_attempts}×` : `${q.used_attempts ?? 0}×`;
}

async function loadData() {
  quizzesLoading.value = true;
  assignmentsLoading.value = true;
  quizzesError.value = '';
  assignmentsError.value = '';

  try {
    const res = await apiGetFull<Quiz[]>('/quizzes');
    quizzes.value = (res.data ?? []).filter(q => q.course_id === props.courseId);
  } catch (e) {
    quizzesError.value = errorMessage(e, t('assessments.list.quizLoadFailed'));
  } finally {
    quizzesLoading.value = false;
  }

  try {
    const res = await apiGetFull<Assignment[]>('/assignments');
    assignments.value = (res.data ?? []).filter(a => a.course_id === props.courseId);
  } catch (e) {
    assignmentsError.value = errorMessage(e, t('assessments.list.assignmentLoadFailed'));
  } finally {
    assignmentsLoading.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div>
    <div class="tab-bar mb-4">
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'quiz' }" @click="tab = 'quiz'">
        {{ t('assessments.list.tabQuiz') }}
      </button>
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'assignment' }" @click="tab = 'assignment'">
        {{ t('assessments.list.tabAssignment') }}
      </button>
    </div>

    <div v-if="tab === 'quiz'">
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
          <span class="inline-block rounded-full px-2.5 py-1 text-xs font-medium" :class="quizStatusClass(row as Quiz)">
            {{ quizStatusText(row as Quiz) }}
          </span>
        </template>
        <template #actions="{ row }">
          <div class="flex items-center justify-end gap-3">
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
          </div>
        </template>
      </DataTable>
    </div>

    <div v-else>
      <div v-if="assignmentsError" class="mb-4 alert-error">{{ assignmentsError }}</div>
      <DataTable :columns="assignmentColumns" :rows="assignments" :loading="assignmentsLoading" :empty="t('assessments.list.assignmentEmpty')">
        <template #cell:due_at="{ value }">{{ value ? fmtTanggal(String(value)) : '—' }}</template>
        <template #cell:submission_type="{ value }">{{ submissionTypeLabel(value as string) }}</template>
        <template #cell:status="{ row }">
          <span class="inline-block rounded-full px-2.5 py-1 text-xs font-medium" :class="assignmentStatusClass(row as Assignment)">
            {{ assignmentStatusText(row as Assignment) }}
          </span>
        </template>
      </DataTable>
    </div>
  </div>
</template>
