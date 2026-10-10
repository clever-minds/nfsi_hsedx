<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGet, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';

/**
 * Soal di dalam satu bank soal.
 *
 * previous no ada layar untuk menambah soal sama sekali — bank soal bisa
 * created, tapi selalu kosong, sehingga quiz/exam no pernah bisa disusun from
 * Admin Panel. Tipe yang disediakan di sini adalah yang dinilai otomatis
 * (pilihan tunggal/ganda, benar-salah, isian singkat) plus esai.
 */
type Tipe = 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
interface Option {
  id?: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}
interface Question {
  id: string;
  type: Tipe | string;
  question_text: string;
  points: string | number;
  answer_explanation: string | null;
  options: Option[];
}
interface Bank {
  id: string;
  name: string;
  course_title?: string | null;
}

const TIPE: Tipe[] = ['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay'];

const route = useRoute();
const { t } = useI18n();
const auth = useAuthStore();
const bankId = computed(() => route.params.id as string);
const canCreate = auth.can('bank_soal.create');
const canUpdate = auth.can('bank_soal.update');
const canDelete = auth.can('bank_soal.delete');

const bank = ref<Bank | null>(null);
const questions = ref<Question[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref('');
const form = reactive({
  type: 'single_choice' as Tipe,
  question_text: '',
  points: 1,
  penjelasan: '',
  options: [] as Option[],
});

const blankOptions = (): Option[] => [
  { option_text: '', is_correct: true, sort_order: 0 },
  { option_text: '', is_correct: false, sort_order: 1 },
];
const trueFalse = (): Option[] => [
  { option_text: t('assessments.bank.true'), is_correct: true, sort_order: 0 },
  { option_text: t('assessments.bank.false'), is_correct: false, sort_order: 1 },
];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [b, qs] = await Promise.all([
      apiGet<Bank>(`/question-banks/${bankId.value}`),
      apiGet<Question[]>(`/question-banks/${bankId.value}/questions`),
    ]);
    bank.value = b;
    questions.value = qs ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('assessments.bank.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onTipe() {
  if (form.type === 'true_false') form.options = trueFalse();
  else if (form.type === 'essay') form.options = [];
  else if (form.type === 'short_answer') form.options = [{ option_text: '', is_correct: true, sort_order: 0 }];
  else if (!form.options.length || form.options.length < 2) form.options = blankOptions();
  if (form.type === 'single_choice') {
    // Pilihan tunggal: tepat satu answer benar.
    const first = form.options.findIndex((o) => o.is_correct);
    form.options.forEach((o, i) => (o.is_correct = i === (first < 0 ? 0 : first)));
  }
}

function openCreate() {
  editingId.value = null;
  formError.value = '';
  Object.assign(form, { type: 'single_choice', question_text: '', points: 1, penjelasan: '', options: blankOptions() });
  showForm.value = true;
}

function openEdit(q: Question) {
  editingId.value = q.id;
  formError.value = '';
  Object.assign(form, {
    type: q.type as Tipe,
    question_text: q.question_text,
    points: Number(q.points),
    penjelasan: q.answer_explanation ?? '',
    options: q.options.map((o) => ({ option_text: o.option_text, is_correct: o.is_correct, sort_order: o.sort_order })),
  });
  showForm.value = true;
}

function addOption() {
  form.options.push({ option_text: '', is_correct: form.type === 'short_answer', sort_order: form.options.length });
}
function removeOption(i: number) {
  form.options.splice(i, 1);
  form.options.forEach((o, j) => (o.sort_order = j));
}
function markCorrect(i: number) {
  if (form.type === 'multiple_choice') form.options[i].is_correct = !form.options[i].is_correct;
  else form.options.forEach((o, j) => (o.is_correct = j === i));
}

async function submit() {
  formError.value = '';
  if (!form.question_text.trim()) {
    formError.value = t('assessments.bank.textRequired');
    return;
  }
  const options = form.options.filter((o) => o.option_text.trim()).map((o, i) => ({ ...o, option_text: o.option_text.trim(), sort_order: i }));
  if (form.type !== 'essay') {
    if (form.type !== 'short_answer' && options.length < 2) {
      formError.value = t('assessments.bank.needTwoOptions');
      return;
    }
    if (!options.some((o) => o.is_correct)) {
      formError.value = t('assessments.bank.needCorrect');
      return;
    }
  }
  saving.value = true;
  const payload = {
    question_text: form.question_text.trim(),
    points: Number(form.points) || 0,
    answer_explanation: form.penjelasan.trim() || null,
    options,
  };
  try {
    if (editingId.value) await apiPut(`/questions/${editingId.value}`, payload);
    else await apiPost(`/question-banks/${bankId.value}/questions`, { ...payload, type: form.type });
    showForm.value = false;
    await load();
  } catch (e) {
    formError.value = errorMessage(e, t('assessments.bank.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function remove(q: Question) {
  if (!window.confirm(t('assessments.bank.confirmDelete'))) return;
  busyId.value = q.id;
  try {
    await apiDelete(`/questions/${q.id}`);
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('assessments.bank.deleteFailed'));
  } finally {
    busyId.value = null;
  }
}

const totalPoin = computed(() => questions.value.reduce((s, q) => s + Number(q.points || 0), 0));

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="bank?.name ?? t('assessments.bank.title')" :subtitle="bank?.course_title ?? t('assessments.bank.subtitle')">
      <template #actions>
        <RouterLink :to="{ name: 'assessments', query: { tab: 'bank' } }" class="btn-outline">{{ t('assessments.builder.back') }}</RouterLink>
        <button v-if="canCreate" class="btn-primary" @click="openCreate">{{ t('assessments.bank.add') }}</button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <div v-if="showForm" class="card mb-4 p-5">
      <h3 class="card-title">{{ editingId ? t('assessments.bank.formEdit') : t('assessments.bank.formNew') }}</h3>
      <div v-if="formError" class="mt-2 alert-error">{{ formError }}</div>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label class="label" for="q-type">Question Type</label>
          <!-- Tipe soal no bisa diubah setelah created (backend no menerimanya). -->
          <select id="q-type" v-model="form.type" class="input" :disabled="!!editingId" @change="onTipe">
            <option v-for="x in TIPE" :key="x" :value="x">{{ t(`assessments.bank.type.${x}`) }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="q-points">{{ t('assessments.bank.points') }}</label>
          <input id="q-points" v-model.number="form.points" type="number" min="0" step="0.5" class="input" />
          <p class="mt-1 text-xs text-slate-400">{{ t('assessments.bank.pointsHint') }}</p>
        </div>
        <div class="sm:col-span-3">
          <label class="label" for="q-text">{{ t('assessments.bank.text') }}</label>
          <textarea id="q-text" v-model="form.question_text" rows="3" class="input"></textarea>
        </div>

        <div v-if="form.type !== 'essay'" class="sm:col-span-3">
          <label class="label">
            {{ form.type === 'short_answer' ? t('assessments.bank.acceptedAnswers') : t('assessments.bank.options') }}
          </label>
          <p class="mb-2 text-xs text-slate-400">
            {{ form.type === 'short_answer' ? t('assessments.bank.acceptedHint') : form.type === 'multiple_choice' ? t('assessments.bank.multiHint') : t('assessments.bank.singleHint') }}
          </p>
          <div v-for="(o, i) in form.options" :key="i" class="mb-2 flex items-center gap-2">
            <button
              v-if="form.type !== 'short_answer'"
              type="button"
              class="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm"
              :class="o.is_correct ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-300'"
              :title="t('assessments.bank.markCorrect')"
              @click="markCorrect(i)"
            >
              ✓
            </button>
            <input v-model="o.option_text" class="input" :disabled="form.type === 'true_false'" />
            <button
              v-if="form.type !== 'true_false' && form.options.length > 1"
              type="button"
              class="btn-outline btn-sm text-rose-600"
              @click="removeOption(i)"
            >
              ×
            </button>
          </div>
          <button v-if="form.type !== 'true_false'" type="button" class="btn-outline btn-sm" @click="addOption">
            {{ t('assessments.bank.addOption') }}
          </button>
        </div>
        <p v-else class="text-xs text-amber-600 sm:col-span-3">{{ t('assessments.bank.essayWarning') }}</p>

        <div class="sm:col-span-3">
          <label class="label" for="q-expl">{{ t('assessments.bank.explanation') }}</label>
          <textarea id="q-expl" v-model="form.penjelasan" rows="2" class="input"></textarea>
        </div>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-outline" @click="showForm = false">{{ t('common.action.cancel') }}</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          {{ saving ? t('common.state.saving') : t('common.action.save') }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <div v-else class="card divide-y divide-slate-100">
      <div class="flex items-center justify-between px-5 py-3 text-sm text-slate-500">
        <span>{{ t('assessments.list.questionsCount', { n: fmtAngka(questions.length) }) }}</span>
        <span>{{ t('assessments.bank.totalPoints', { n: fmtAngka(totalPoin) }) }}</span>
      </div>
      <p v-if="!questions.length" class="px-5 py-8 text-center text-sm text-slate-400">{{ t('assessments.bank.empty') }}</p>
      <div v-for="(q, i) in questions" :key="q.id" class="flex gap-4 px-5 py-4">
        <span class="num w-6 shrink-0 text-sm text-slate-400">{{ i + 1 }}.</span>
        <div class="min-w-0 flex-1">
          <p class="whitespace-pre-line text-sm text-slate-800">{{ q.question_text }}</p>
          <p class="mt-1 text-xs text-slate-400">
            {{ t(`assessments.bank.type.${q.type}`) }} · {{ t('assessments.bank.pointsN', { n: fmtAngka(Number(q.points)) }) }}
          </p>
          <ul v-if="q.options.length" class="mt-2 space-y-0.5 text-xs">
            <li v-for="o in q.options" :key="o.id" :class="o.is_correct ? 'font-medium text-emerald-600' : 'text-slate-500'">
              {{ o.is_correct ? '✓' : '•' }} {{ o.option_text }}
            </li>
          </ul>
        </div>
        <div class="flex shrink-0 items-start gap-1.5">
          <button v-if="canUpdate" class="btn-outline btn-sm" @click="openEdit(q)">{{ t('common.action.edit') }}</button>
          <button v-if="canDelete" class="btn-outline btn-sm text-rose-600" :disabled="busyId === q.id" @click="remove(q)">
            {{ t('common.action.delete') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
