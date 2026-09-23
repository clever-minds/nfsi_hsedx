<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';

interface QuestionBank {
  id: string;
  nama: string;
}
interface QuestionSummary {
  id: string;
  teks: string;
  tipe: string;
}
interface QuizDetail {
  id: string;
  judul: string;
  kursusId?: string;
  batasWaktuMenit?: number;
  acakSoal?: boolean;
  acakOpsi?: boolean;
  attemptMaks?: number;
  passingScore?: number;
  tampilkanJawabanSetelahSelesai?: boolean;
  questionIds?: string[];
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const quizId = computed(() => (route.params.id as string) || '');
const isEdit = computed(() => !!quizId.value);

const loading = ref(false);
const error = ref('');
const saving = ref(false);

const form = reactive({
  judul: '',
  kursusId: '',
  batasWaktuMenit: 20,
  acakSoal: true,
  acakOpsi: true,
  attemptMaks: 1,
  passingScore: 70,
  tampilkanJawaban: false,
});

const banks = ref<QuestionBank[]>([]);
const banksLoading = ref(false);
const selectedBankId = ref('');
const questions = ref<QuestionSummary[]>([]);
const questionsLoading = ref(false);
const selectedQuestionIds = ref<Set<string>>(new Set());

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

function toggleQuestion(id: string) {
  if (selectedQuestionIds.value.has(id)) selectedQuestionIds.value.delete(id);
  else selectedQuestionIds.value.add(id);
  selectedQuestionIds.value = new Set(selectedQuestionIds.value);
}

async function loadQuiz() {
  if (!isEdit.value) return;
  loading.value = true;
  error.value = '';
  try {
    const q = await apiGet<QuizDetail>(`/quizzes/${quizId.value}`);
    form.judul = q.judul;
    form.kursusId = q.kursusId || '';
    form.batasWaktuMenit = q.batasWaktuMenit ?? 20;
    form.acakSoal = q.acakSoal ?? true;
    form.acakOpsi = q.acakOpsi ?? true;
    form.attemptMaks = q.attemptMaks ?? 1;
    form.passingScore = q.passingScore ?? 70;
    form.tampilkanJawaban = q.tampilkanJawabanSetelahSelesai ?? false;
    selectedQuestionIds.value = new Set(q.questionIds ?? []);
  } catch (e) {
    error.value = errorMessage(e, t('assessments.builder.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.judul.trim() || !form.kursusId.trim()) {
    error.value = t('assessments.builder.required');
    return;
  }
  saving.value = true;
  error.value = '';
  const payload = {
    judul: form.judul.trim(),
    kursusId: form.kursusId.trim(),
    batasWaktuMenit: form.batasWaktuMenit,
    acakSoal: form.acakSoal,
    acakOpsi: form.acakOpsi,
    attemptMaks: form.attemptMaks,
    passingScore: form.passingScore,
    tampilkanJawabanSetelahSelesai: form.tampilkanJawaban,
    questionIds: Array.from(selectedQuestionIds.value),
  };
  try {
    if (isEdit.value) await apiPut(`/quizzes/${quizId.value}`, payload);
    else await apiPost('/quizzes', payload);
    router.push({ name: 'assessments' });
  } catch (e) {
    error.value = errorMessage(e, t('assessments.builder.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
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
            <label class="label">{{ t('assessments.builder.quizTitle') }}</label>
            <input v-model="form.judul" class="input" :placeholder="t('assessments.builder.quizTitlePlaceholder')" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('assessments.builder.courseId') }}</label>
            <input v-model="form.kursusId" class="input" :placeholder="t('assessments.builder.courseIdPlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('assessments.builder.timeLimit') }}</label>
            <input v-model.number="form.batasWaktuMenit" type="number" min="1" class="input" />
          </div>
          <div>
            <label class="label">{{ t('assessments.builder.maxAttempts') }}</label>
            <input v-model.number="form.attemptMaks" type="number" min="1" class="input" />
          </div>
          <div>
            <label class="label">{{ t('assessments.builder.passingScore') }}</label>
            <input v-model.number="form.passingScore" type="number" min="0" max="100" class="input" />
          </div>
          <div class="flex flex-col justify-end gap-2 pb-1">
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
        <div class="mt-2">
          <label class="label">{{ t('assessments.builder.questionBank') }}</label>
          <select v-model="selectedBankId" class="input max-w-sm" :disabled="banksLoading">
            <option value="">{{ t('assessments.builder.pickBank') }}</option>
            <option v-for="b in banks" :key="b.id" :value="b.id">{{ b.nama }}</option>
          </select>
        </div>
        <div v-if="questionsLoading" class="mt-3 text-sm text-slate-400">{{ t('assessments.builder.loadingQuestions') }}</div>
        <ul v-else-if="questions.length" class="mt-3 max-h-80 space-y-1 overflow-y-auto">
          <li v-for="q in questions" :key="q.id" class="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
            <input :id="`q-${q.id}`" type="checkbox" :checked="selectedQuestionIds.has(q.id)" @change="toggleQuestion(q.id)" />
            <label :for="`q-${q.id}`" class="flex-1 cursor-pointer text-sm text-slate-700">{{ q.teks }}</label>
            <span class="text-xs text-slate-400">{{ q.tipe }}</span>
          </li>
        </ul>
        <p v-else-if="selectedBankId" class="mt-3 text-sm text-slate-400">{{ t('assessments.builder.bankEmpty') }}</p>
        <p v-else class="mt-3 text-sm text-slate-400">{{ t('assessments.builder.pickBankFirst') }}</p>
      </div>

      <aside class="card h-fit p-4">
        <h3 class="card-title">{{ t('assessments.builder.summary') }}</h3>
        <p class="mt-2 text-sm text-slate-500">
          {{ t('assessments.builder.selectedQuestions', { n: fmtAngka(selectedQuestionIds.size) }) }}
        </p>
        <p class="mt-1 text-sm text-slate-500">{{ t('assessments.builder.summaryPassing', { n: fmtAngka(form.passingScore) }) }}</p>
        <p class="mt-1 text-sm text-slate-500">{{ t('assessments.builder.summaryTime', { n: fmtAngka(form.batasWaktuMenit) }) }}</p>
        <button class="btn-primary mt-4 w-full" :disabled="saving" @click="save">
          {{ saving ? t('common.state.saving') : t('assessments.builder.save') }}
        </button>
      </aside>
    </div>
  </div>
</template>
