<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtPersen, fmtTanggal } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import DataTable from '@/components/ui/DataTable.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import PageHeader from '@/components/ui/PageHeader.vue';

interface QuestionBank extends Record<string, unknown> {
  id: string;
  nama: string;
  kursus_judul?: string;
  jumlah_soal?: number;
}
interface Quiz extends Record<string, unknown> {
  id: string;
  judul: string;
  kursus_judul?: string;
  kursus_id?: string;
  batas_waktu_menit?: number;
  attempt_maksimal?: number;
  passing_score?: string | number;
  total_poin?: string | number;
  is_aktif?: boolean;
  // Diisi BE untuk siswa: status & nilai attempt miliknya.
  attempt_status?: string;
  skor_terbaik?: string | null;
  attempt_terpakai?: number;
}
interface Assignment extends Record<string, unknown> {
  id: string;
  judul: string;
  kursus_judul?: string;
  tenggat_at?: string;
  tipe_pengumpulan?: string;
  instruksi?: string;
  is_aktif?: boolean;
  // Diisi BE untuk siswa: status submission miliknya.
  submission_status?: string;
}

const auth = useAuthStore();
const { t, te } = useI18n();
// Bank soal = area pengelola (instruktur/admin). Siswa hanya melihat kuis & tugas untuk dikerjakan.
const isPengelola = auth.can('bank_soal.view');
const tab = ref<'bank' | 'kuis' | 'tugas'>('kuis');

// ── Bank Soal ──
const banks = ref<QuestionBank[]>([]);
const banksLoading = ref(true);
const banksError = ref('');
const bankColumns = computed(() => [
  { key: 'nama', label: t('assessments.list.colBank') },
  { key: 'kursus_judul', label: t('assessments.list.colBankCourse') },
  { key: 'jumlah_soal', label: t('assessments.list.colQuestionCount') },
]);
const showBankForm = ref(false);
const bankForm = reactive({ nama: '', kursusId: '' });
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
  if (!bankForm.nama.trim()) {
    bankFormError.value = t('assessments.list.bankNameRequired');
    return;
  }
  bankSubmitting.value = true;
  bankFormError.value = '';
  try {
    await apiPost('/question-banks', { nama: bankForm.nama.trim(), kursusId: bankForm.kursusId.trim() || undefined });
    showBankForm.value = false;
    bankForm.nama = '';
    bankForm.kursusId = '';
    await loadBanks();
  } catch (e) {
    bankFormError.value = errorMessage(e, t('assessments.list.bankCreateFailed'));
  } finally {
    bankSubmitting.value = false;
  }
}

// ── Kuis ──
const quizzes = ref<Quiz[]>([]);
const quizzesLoading = ref(true);
const quizzesError = ref('');
const quizColumns = computed(() => [
  { key: 'judul', label: t('assessments.list.colQuiz') },
  { key: 'kursus_judul', label: t('assessments.list.colCourse') },
  { key: 'batas_waktu_menit', label: t('assessments.list.colTimeLimit') },
  { key: 'attempt_maksimal', label: t('assessments.list.colMaxAttempts') },
  { key: 'passing_score', label: t('assessments.list.colPassingScore') },
  { key: 'status', label: t('assessments.list.colStatus') },
]);

// ── Status & aksi kuis (khusus siswa) ──
function quizStatusText(q: Quiz): string {
  const s = q.attempt_status;
  if (!s || s === 'belum' || s === 'belum_dikerjakan') return t('assessments.list.quizStatus.notStarted');
  if (s === 'sedang') return t('assessments.list.quizStatus.inProgress');
  if (s === 'dikumpulkan') return t('assessments.list.quizStatus.awaitingGrading');
  if (s === 'dinilai') {
    const skor = Number(q.skor_terbaik ?? 0);
    const total = Number(q.total_poin ?? 0);
    const pct = total ? Math.round((skor / total) * 100) : 0;
    const lulus = q.passing_score != null ? pct >= Number(q.passing_score) : null;
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
    const pct = Number(q.total_poin) ? (Number(q.skor_terbaik ?? 0) / Number(q.total_poin)) * 100 : 0;
    const lulus = q.passing_score != null ? pct >= Number(q.passing_score) : true;
    return lulus ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  }
  if (s === 'sedang' || s === 'dikumpulkan') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}
function sisaAttempt(q: Quiz): number {
  return Math.max(0, (q.attempt_maksimal ?? 1) - (q.attempt_terpakai ?? 0));
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

// ── Tugas ──
const assignments = ref<Assignment[]>([]);
const assignmentsLoading = ref(true);
const assignmentsError = ref('');
const assignmentColumns = computed(() => [
  { key: 'judul', label: t('assessments.list.colAssignment') },
  { key: 'kursus_judul', label: t('assessments.list.colCourse') },
  { key: 'tenggat_at', label: t('assessments.list.colDueDate') },
  { key: 'tipe_pengumpulan', label: t('assessments.list.colSubmissionType') },
  { key: 'status', label: t('assessments.list.colStatus') },
]);

/** Label tipe pengumpulan (`file` | `tautan` | `teks`) dari katalog i18n. */
function submissionTypeLabel(tipe?: string): string {
  if (tipe === 'tautan') return t('assessments.list.typeLink');
  if (tipe === 'teks') return t('assessments.list.typeText');
  if (tipe === 'file') return t('assessments.list.typeFile');
  return tipe || '—';
}

// ── Status & aksi tugas (khusus siswa) ──
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

// Modal pengumpulan tugas siswa
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
  const tipe = submitTarget.value.tipe_pengumpulan;
  if (tipe === 'tautan' && !submitForm.url.trim()) {
    submitError.value = t('assessments.list.linkRequired');
    return;
  }
  if (tipe === 'teks' && !submitForm.isi_teks.trim()) {
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
const assignmentForm = reactive({ judul: '', kursusId: '', tenggat: '', tipePengumpulan: 'file', instruksi: '' });
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
  if (!assignmentForm.judul.trim() || !assignmentForm.kursusId.trim()) {
    assignmentFormError.value = t('assessments.list.assignmentRequired');
    return;
  }
  assignmentSubmitting.value = true;
  assignmentFormError.value = '';
  try {
    await apiPost('/assignments', {
      judul: assignmentForm.judul.trim(),
      kursusId: assignmentForm.kursusId.trim(),
      tenggat: assignmentForm.tenggat || undefined,
      tipePengumpulan: assignmentForm.tipePengumpulan,
      instruksi: assignmentForm.instruksi,
    });
    showAssignmentForm.value = false;
    assignmentForm.judul = '';
    assignmentForm.kursusId = '';
    assignmentForm.tenggat = '';
    assignmentForm.instruksi = '';
    await loadAssignments();
  } catch (e) {
    assignmentFormError.value = errorMessage(e, t('assessments.list.assignmentCreateFailed'));
  } finally {
    assignmentSubmitting.value = false;
  }
}

function switchTab(next: 'bank' | 'kuis' | 'tugas') {
  tab.value = next;
}

onMounted(() => {
  if (isPengelola) loadBanks(); // hindari 403 bank_soal.view untuk siswa
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
        <RouterLink v-else-if="tab === 'kuis'" :to="{ name: 'quiz-create' }" class="btn-primary">
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
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'kuis' }" @click="switchTab('kuis')">
        {{ t('assessments.list.tabQuiz') }}
      </button>
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'tugas' }" @click="switchTab('tugas')">
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
            <input v-model="bankForm.nama" class="input" :placeholder="t('assessments.list.bankNamePlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('assessments.list.bankCourseId') }}</label>
            <input v-model="bankForm.kursusId" class="input" :placeholder="t('assessments.list.courseIdPlaceholder')" />
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
      </DataTable>
    </div>

    <!-- Kuis -->
    <div v-else-if="tab === 'kuis'">
      <div v-if="quizzesError" class="mb-4 alert-error">{{ quizzesError }}</div>
      <DataTable :columns="quizColumns" :rows="quizzes" :loading="quizzesLoading" :empty="t('assessments.list.quizEmpty')">
        <template #cell:passing_score="{ value }">{{ value != null ? fmtPersen(Number(value)) : '—' }}</template>
        <template #cell:status="{ row }">
          <!-- Pengelola: status aktif/nonaktif kuis. Siswa: status pengerjaan miliknya. -->
          <StatusChip v-if="isPengelola" :status="(row as Quiz).is_aktif ? 'aktif' : 'nonaktif'" />
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
                v-if="sisaAttempt(row as Quiz) > 0"
                :to="{ name: 'quiz-attempt', params: { quizId: (row as Quiz).id } }"
                class="btn-primary btn-sm"
              >
                {{ (row as Quiz).attempt_terpakai ? t('assessments.list.retake') : t('assessments.list.take') }}
              </RouterLink>
              <span v-else class="text-xs font-medium text-slate-400">{{ t('assessments.list.noAttemptsLeft') }}</span>
              <span v-if="(row as Quiz).attempt_terpakai" class="num text-xs text-slate-400">
                {{ (row as Quiz).attempt_terpakai }}/{{ (row as Quiz).attempt_maksimal }}×
              </span>
            </template>
          </div>
        </template>
      </DataTable>
    </div>

    <!-- Tugas -->
    <div v-else>
      <div v-if="showAssignmentForm" class="card mb-4 p-4">
        <div v-if="assignmentFormError" class="mb-2 alert-error">{{ assignmentFormError }}</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">{{ t('assessments.list.assignmentTitle') }}</label>
            <input v-model="assignmentForm.judul" class="input" />
          </div>
          <div>
            <label class="label">{{ t('assessments.list.assignmentCourseId') }}</label>
            <input v-model="assignmentForm.kursusId" class="input" :placeholder="t('assessments.list.courseIdPlaceholder')" />
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
              <option value="teks">{{ t('assessments.list.typeText') }}</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('assessments.list.instructions') }}</label>
            <textarea v-model="assignmentForm.instruksi" class="input" rows="3"></textarea>
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
        <template #cell:tenggat_at="{ value }">{{ value ? fmtTanggal(String(value)) : '—' }}</template>
        <template #cell:tipe_pengumpulan="{ value }">{{ submissionTypeLabel(value as string) }}</template>
        <template #cell:status="{ row }">
          <StatusChip v-if="isPengelola" :status="(row as Assignment).is_aktif ? 'aktif' : 'nonaktif'" />
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

    <!-- Modal kumpulkan tugas (siswa) -->
    <div v-if="submitTarget" class="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
      <div class="card w-full max-w-lg p-5">
        <h3 class="card-title">{{ t('assessments.list.submitTitle', { title: submitTarget.judul }) }}</h3>
        <p v-if="submitTarget.instruksi" class="mt-1 whitespace-pre-line text-sm text-slate-500">{{ submitTarget.instruksi }}</p>
        <p class="mt-1 text-xs text-slate-400">
          {{ t('assessments.list.submitTypeLabel') }}
          <span class="font-medium">{{ submissionTypeLabel(submitTarget.tipe_pengumpulan) }}</span>
        </p>

        <div v-if="submitError" class="mt-3 alert-error">{{ submitError }}</div>

        <div class="mt-4 space-y-3">
          <div v-if="submitTarget.tipe_pengumpulan === 'tautan'">
            <label class="label">{{ t('assessments.list.linkLabel') }}</label>
            <input v-model="submitForm.url" class="input" placeholder="https://…" />
          </div>
          <div v-else-if="submitTarget.tipe_pengumpulan === 'file'">
            <label class="label">{{ t('assessments.list.fileLinkLabel') }}</label>
            <input v-model="submitForm.url" class="input" :placeholder="t('assessments.list.fileLinkPlaceholder')" />
            <p class="mt-1 text-xs text-slate-400">{{ t('assessments.list.fileHint') }}</p>
          </div>
          <div>
            <label class="label">
              {{
                submitTarget.tipe_pengumpulan === 'teks'
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
