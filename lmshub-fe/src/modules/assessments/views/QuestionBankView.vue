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
 * Sebelumnya tidak ada layar untuk menambah soal sama sekali — bank soal bisa
 * dibuat, tapi selalu kosong, sehingga quiz/ujian tidak pernah bisa disusun dari
 * Admin Panel. Tipe yang disediakan di sini adalah yang dinilai otomatis
 * (pilihan tunggal/ganda, benar-salah, isian singkat) plus esai.
 */
type Tipe = 'pilihan_tunggal' | 'pilihan_ganda' | 'benar_salah' | 'isian_singkat' | 'esai';
interface Option {
  id?: string;
  teks_opsi: string;
  is_benar: boolean;
  sort_order: number;
}
interface Question {
  id: string;
  tipe: Tipe | string;
  teks_soal: string;
  poin: string | number;
  penjelasan_jawaban: string | null;
  options: Option[];
}
interface Bank {
  id: string;
  name: string;
  course_title?: string | null;
}

const TIPE: Tipe[] = ['pilihan_tunggal', 'pilihan_ganda', 'benar_salah', 'isian_singkat', 'esai'];

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
  tipe: 'pilihan_tunggal' as Tipe,
  teks_soal: '',
  poin: 1,
  penjelasan: '',
  options: [] as Option[],
});

const blankOptions = (): Option[] => [
  { teks_opsi: '', is_benar: true, sort_order: 0 },
  { teks_opsi: '', is_benar: false, sort_order: 1 },
];
const trueFalse = (): Option[] => [
  { teks_opsi: t('assessments.bank.true'), is_benar: true, sort_order: 0 },
  { teks_opsi: t('assessments.bank.false'), is_benar: false, sort_order: 1 },
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
  if (form.tipe === 'benar_salah') form.options = trueFalse();
  else if (form.tipe === 'esai') form.options = [];
  else if (form.tipe === 'isian_singkat') form.options = [{ teks_opsi: '', is_benar: true, sort_order: 0 }];
  else if (!form.options.length || form.options.length < 2) form.options = blankOptions();
  if (form.tipe === 'pilihan_tunggal') {
    // Pilihan tunggal: tepat satu jawaban benar.
    const first = form.options.findIndex((o) => o.is_benar);
    form.options.forEach((o, i) => (o.is_benar = i === (first < 0 ? 0 : first)));
  }
}

function openCreate() {
  editingId.value = null;
  formError.value = '';
  Object.assign(form, { tipe: 'pilihan_tunggal', teks_soal: '', poin: 1, penjelasan: '', options: blankOptions() });
  showForm.value = true;
}

function openEdit(q: Question) {
  editingId.value = q.id;
  formError.value = '';
  Object.assign(form, {
    tipe: q.tipe as Tipe,
    teks_soal: q.teks_soal,
    poin: Number(q.poin),
    penjelasan: q.penjelasan_jawaban ?? '',
    options: q.options.map((o) => ({ teks_opsi: o.teks_opsi, is_benar: o.is_benar, sort_order: o.sort_order })),
  });
  showForm.value = true;
}

function addOption() {
  form.options.push({ teks_opsi: '', is_benar: form.tipe === 'isian_singkat', sort_order: form.options.length });
}
function removeOption(i: number) {
  form.options.splice(i, 1);
  form.options.forEach((o, j) => (o.sort_order = j));
}
function markCorrect(i: number) {
  if (form.tipe === 'pilihan_ganda') form.options[i].is_benar = !form.options[i].is_benar;
  else form.options.forEach((o, j) => (o.is_benar = j === i));
}

async function submit() {
  formError.value = '';
  if (!form.teks_soal.trim()) {
    formError.value = t('assessments.bank.textRequired');
    return;
  }
  const options = form.options.filter((o) => o.teks_opsi.trim()).map((o, i) => ({ ...o, teks_opsi: o.teks_opsi.trim(), sort_order: i }));
  if (form.tipe !== 'esai') {
    if (form.tipe !== 'isian_singkat' && options.length < 2) {
      formError.value = t('assessments.bank.needTwoOptions');
      return;
    }
    if (!options.some((o) => o.is_benar)) {
      formError.value = t('assessments.bank.needCorrect');
      return;
    }
  }
  saving.value = true;
  const payload = {
    teks_soal: form.teks_soal.trim(),
    poin: Number(form.poin) || 0,
    penjelasan_jawaban: form.penjelasan.trim() || null,
    options,
  };
  try {
    if (editingId.value) await apiPut(`/questions/${editingId.value}`, payload);
    else await apiPost(`/question-banks/${bankId.value}/questions`, { ...payload, tipe: form.tipe });
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

const totalPoin = computed(() => questions.value.reduce((s, q) => s + Number(q.poin || 0), 0));

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
          <label class="label" for="q-type">{{ t('assessments.bank.type') }}</label>
          <!-- Tipe soal tidak bisa diubah setelah dibuat (backend tidak menerimanya). -->
          <select id="q-type" v-model="form.tipe" class="input" :disabled="!!editingId" @change="onTipe">
            <option v-for="x in TIPE" :key="x" :value="x">{{ t(`assessments.bank.tipe.${x}`) }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="q-points">{{ t('assessments.bank.points') }}</label>
          <input id="q-points" v-model.number="form.poin" type="number" min="0" step="0.5" class="input" />
          <p class="mt-1 text-xs text-slate-400">{{ t('assessments.bank.pointsHint') }}</p>
        </div>
        <div class="sm:col-span-3">
          <label class="label" for="q-text">{{ t('assessments.bank.text') }}</label>
          <textarea id="q-text" v-model="form.teks_soal" rows="3" class="input"></textarea>
        </div>

        <div v-if="form.tipe !== 'esai'" class="sm:col-span-3">
          <label class="label">
            {{ form.tipe === 'isian_singkat' ? t('assessments.bank.acceptedAnswers') : t('assessments.bank.options') }}
          </label>
          <p class="mb-2 text-xs text-slate-400">
            {{ form.tipe === 'isian_singkat' ? t('assessments.bank.acceptedHint') : form.tipe === 'pilihan_ganda' ? t('assessments.bank.multiHint') : t('assessments.bank.singleHint') }}
          </p>
          <div v-for="(o, i) in form.options" :key="i" class="mb-2 flex items-center gap-2">
            <button
              v-if="form.tipe !== 'isian_singkat'"
              type="button"
              class="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm"
              :class="o.is_benar ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-300'"
              :title="t('assessments.bank.markCorrect')"
              @click="markCorrect(i)"
            >
              ✓
            </button>
            <input v-model="o.teks_opsi" class="input" :disabled="form.tipe === 'benar_salah'" />
            <button
              v-if="form.tipe !== 'benar_salah' && form.options.length > 1"
              type="button"
              class="btn-outline btn-sm text-rose-600"
              @click="removeOption(i)"
            >
              ×
            </button>
          </div>
          <button v-if="form.tipe !== 'benar_salah'" type="button" class="btn-outline btn-sm" @click="addOption">
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
          <p class="whitespace-pre-line text-sm text-slate-800">{{ q.teks_soal }}</p>
          <p class="mt-1 text-xs text-slate-400">
            {{ t(`assessments.bank.tipe.${q.tipe}`) }} · {{ t('assessments.bank.pointsN', { n: fmtAngka(Number(q.poin)) }) }}
          </p>
          <ul v-if="q.options.length" class="mt-2 space-y-0.5 text-xs">
            <li v-for="o in q.options" :key="o.id" :class="o.is_benar ? 'font-medium text-emerald-600' : 'text-slate-500'">
              {{ o.is_benar ? '✓' : '•' }} {{ o.teks_opsi }}
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
