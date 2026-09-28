<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtTanggalSaja } from '@/lib/format';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import PageHeader from '@/components/ui/PageHeader.vue';

interface SubmissionItem extends Record<string, unknown> {
  id: string;
  siswa_nama?: string;
  kursus_judul?: string;
  jenis?: string; // kuis | tugas | esai
  judul_asesmen?: string;
  tanggal_kumpul?: string;
  status: string;
}

interface RubricCriteria {
  id: string;
  nama: string;
  bobot?: number;
  skorMaks?: number;
}

interface SubmissionDetail {
  id: string;
  siswa_nama?: string;
  judul_asesmen?: string;
  konten_teks?: string;
  file_url?: string;
  tautan?: string;
  rubric?: RubricCriteria[];
  feedback?: string;
  status: string;
}

const { t } = useI18n();

const queue = ref<SubmissionItem[]>([]);
const loading = ref(true);
const error = ref('');
const filterStatus = ref('menunggu_penilaian');
const page = ref(1);
const limit = 20;
const total = ref(0);

const columns = computed(() => [
  { key: 'siswa_nama', label: t('grading.queue.colStudent') },
  { key: 'judul_asesmen', label: t('grading.queue.colAssessment') },
  { key: 'jenis', label: t('grading.queue.colType') },
  { key: 'kursus_judul', label: t('grading.queue.colCourse') },
  { key: 'tanggal_kumpul', label: t('grading.queue.colSubmittedAt') },
  { key: 'status', label: t('grading.queue.colStatus') },
]);

async function loadQueue() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<SubmissionItem[]>('/submissions', {
      page: page.value,
      limit,
      status: filterStatus.value || undefined,
    });
    queue.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? queue.value.length;
  } catch (e) {
    error.value = errorMessage(e, t('grading.queue.loadFailed'));
    queue.value = [];
  } finally {
    loading.value = false;
  }
}

// ── Panel penilaian ──
const selected = ref<SubmissionDetail | null>(null);
const gradeId = ref<string | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const scores = reactive<Record<string, number>>({});
const feedback = ref('');
const saving = ref(false);
const releasing = ref(false);
const showRevision = ref(false);
const revisionNote = ref('');
const revisionSubmitting = ref(false);

const rubric = computed(() => selected.value?.rubric ?? []);

// Nilai keseluruhan, dipakai saat pengumpulan tidak punya rubrik. Tanpa ini tidak
// ada tempat memasukkan angka sama sekali: penilai hanya bisa menulis feedback.
const skor = ref<number | null>(null);
const skorMaksimal = ref(100);

const totalScore = computed(() => {
  if (!rubric.value.length) return 0;
  const equalWeight = 100 / rubric.value.length;
  return Math.round(rubric.value.reduce((acc, c) => acc + (scores[c.id] ?? 0) * ((c.bobot ?? equalWeight) / 100), 0));
});

/** Nilai yang dikirim: total berbobot bila ada rubrik, angka keseluruhan bila tidak. */
const effectiveScore = computed(() => (rubric.value.length ? totalScore.value : (skor.value ?? 0)));
const isComplete = computed(() => rubric.value.length > 0 && rubric.value.every((c) => scores[c.id] !== undefined && scores[c.id] !== null));

async function openGrading(row: SubmissionItem) {
  detailLoading.value = true;
  detailError.value = '';
  Object.keys(scores).forEach((k) => delete scores[k]);
  // Direset juga, agar nilai pengumpulan sebelumnya tidak terbawa ke berikutnya.
  skor.value = null;
  skorMaksimal.value = 100;
  feedback.value = '';
  gradeId.value = null;
  try {
    // Respons berisi baris mentah `{ submission, grade }` tanpa join. Nama siswa
    // diambil dari baris antrean yang sudah dimuat, dan rubrik belum ikut di sini —
    // karena itu panel penilaian memakai input nilai keseluruhan bila rubrik kosong.
    const detail = await apiGet<{
      submission: Record<string, unknown>;
      grade: { id: string; feedback?: string | null } | null;
    }>(`/submissions/${row.id}/grade`);
    const sub = detail.submission || {};
    selected.value = {
      id: row.id,
      siswa_nama: row.siswa_nama,
      judul_asesmen: row.judul_asesmen,
      konten_teks: (sub.isi_teks as string) ?? undefined,
      tautan: (sub.url as string) ?? undefined,
      status: (sub.status as string) ?? row.status,
      rubric: [],
      feedback: detail.grade?.feedback ?? undefined,
    };
    gradeId.value = detail.grade?.id ?? null;
    feedback.value = selected.value.feedback || '';
  } catch (e) {
    detailError.value = errorMessage(e, t('grading.queue.detailFailed'));
    selected.value = { id: row.id, siswa_nama: row.siswa_nama, judul_asesmen: row.judul_asesmen, status: row.status, rubric: [] };
  } finally {
    detailLoading.value = false;
  }
}

function closePanel() {
  selected.value = null;
  gradeId.value = null;
  showRevision.value = false;
}

async function saveGrade() {
  if (!selected.value) return;
  saving.value = true;
  detailError.value = '';
  try {
    // Nama field harus persis seperti gradeSubmissionSchema di backend: `skor` dan
    // `skor_maksimal` wajib, dan `rubrik` adalah array bernama — bukan map skor
    // per-id seperti bentuk yang dipakai di dalam komponen ini.
    const grade = await apiPost<{ id: string }>(`/submissions/${selected.value.id}/grade`, {
      skor: effectiveScore.value,
      skor_maksimal: rubric.value.length ? 100 : skorMaksimal.value,
      feedback: feedback.value || null,
      ...(rubric.value.length
        ? {
            rubrik: rubric.value.map((c) => ({
              nama: c.nama,
              skor: scores[c.id] ?? 0,
              skor_maks: c.skorMaks ?? 100,
            })),
          }
        : {}),
    });
    if (grade?.id) gradeId.value = grade.id;
  } catch (e) {
    detailError.value = errorMessage(e, t('grading.queue.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function releaseGrade() {
  if (!selected.value) return;
  releasing.value = true;
  detailError.value = '';
  try {
    await saveGrade();
    if (!gradeId.value) throw new Error(t('grading.queue.notSaved'));
    // BE: POST /grades/:id/release (id di sini adalah id record `grades`, bukan id submission).
    await apiPost(`/grades/${gradeId.value}/release`, {});
    closePanel();
    await loadQueue();
  } catch (e) {
    detailError.value = errorMessage(e, t('grading.queue.releaseFailed'));
  } finally {
    releasing.value = false;
  }
}

async function submitRevision() {
  if (!selected.value || !revisionNote.value.trim()) return;
  revisionSubmitting.value = true;
  detailError.value = '';
  try {
    await apiPost(`/submissions/${selected.value.id}/request-revision`, { catatan: revisionNote.value.trim() });
    closePanel();
    revisionNote.value = '';
    await loadQueue();
  } catch (e) {
    detailError.value = errorMessage(e, t('grading.queue.revisionFailed'));
  } finally {
    revisionSubmitting.value = false;
  }
}

function applyFilter() {
  page.value = 1;
  loadQueue();
}

onMounted(loadQueue);
</script>

<template>
  <div>
    <PageHeader :title="t('grading.queue.title')" :subtitle="t('grading.queue.subtitle')" />

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <DataTable :columns="columns" :rows="queue" :loading="loading" :empty="t('grading.queue.empty')">
      <template #toolbar>
        <select v-model="filterStatus" class="input max-w-[14rem]" @change="applyFilter">
          <option value="menunggu_penilaian">{{ t('grading.queue.status.menunggu_penilaian') }}</option>
          <option value="dinilai">{{ t('grading.queue.status.dinilai') }}</option>
          <option value="revisi_diminta">{{ t('grading.queue.status.revisi_diminta') }}</option>
          <option value="">{{ t('grading.queue.allStatus') }}</option>
        </select>
        <button class="btn-outline" @click="applyFilter">{{ t('grading.queue.apply') }}</button>
      </template>
      <template #cell:status="{ value }"><StatusChip :status="String(value)" /></template>
      <template #cell:tanggal_kumpul="{ value }">{{ value ? fmtTanggalSaja(String(value)) : '—' }}</template>
      <template #actions="{ row }">
        <button v-can="'grading.update'" class="row-link row-link-primary" @click="openGrading(row as SubmissionItem)">
          {{ t('grading.queue.grade') }}
        </button>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; loadQueue()" />
      </template>
    </DataTable>

    <!-- Panel penilaian (slide-over) -->
    <div v-if="selected" class="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
      <div class="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="section-title">
            {{ selected.judul_asesmen || t('grading.queue.panelTitle') }} — {{ selected.siswa_nama }}
          </h3>
          <button class="text-slate-400 hover:text-slate-600" :aria-label="t('grading.queue.closeAria')" @click="closePanel">✕</button>
        </div>

        <div v-if="detailLoading" class="mt-6 text-sm text-slate-400">{{ t('common.state.loading') }}</div>
        <template v-else>
          <div v-if="detailError" class="mt-3 alert-error">{{ detailError }}</div>

          <div class="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p v-if="selected.konten_teks">{{ selected.konten_teks }}</p>
            <a v-if="selected.file_url" :href="selected.file_url" target="_blank" rel="noopener" class="font-medium text-brand-700 hover:underline">
              {{ t('grading.queue.viewFile') }}
            </a>
            <a v-if="selected.tautan" :href="selected.tautan" target="_blank" rel="noopener" class="block font-medium text-brand-700 hover:underline">🔗 {{ selected.tautan }}</a>
            <p v-if="!selected.konten_teks && !selected.file_url && !selected.tautan" class="text-slate-400">
              {{ t('grading.queue.noPreview') }}
            </p>
          </div>

          <h4 class="mt-5 text-sm font-semibold text-slate-800">{{ t('grading.queue.rubricTitle') }}</h4>
          <div v-if="rubric.length" class="mt-2 space-y-2">
            <div v-for="c in rubric" :key="c.id" class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <div>
                <div class="text-sm text-slate-700">{{ c.nama }}</div>
                <div class="text-xs text-slate-400">
                  {{ t('grading.queue.weight', { weight: c.bobot ?? Math.round(100 / rubric.length), max: c.skorMaks ?? 100 }) }}
                </div>
              </div>
              <input
                type="number"
                class="input w-24"
                min="0"
                :max="c.skorMaks ?? 100"
                :value="scores[c.id] ?? ''"
                @input="scores[c.id] = Number(($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
              <span>{{ t('grading.queue.totalScore') }}</span><span class="num">{{ fmtAngka(totalScore) }}</span>
            </div>
          </div>
          <div v-else class="mt-2">
            <p class="text-sm text-slate-400">{{ t('grading.queue.noRubric') }}</p>
            <div class="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <span class="text-sm text-slate-700">{{ t('grading.queue.scoreTitle') }}</span>
              <input
                v-model.number="skor"
                type="number"
                class="input w-24"
                min="0"
                :max="skorMaksimal"
                inputmode="numeric"
              />
              <span class="text-xs text-slate-400">{{ t('grading.queue.scoreOf') }}</span>
              <input v-model.number="skorMaksimal" type="number" class="input w-20" min="1" inputmode="numeric" />
            </div>
          </div>

          <h4 class="mt-5 text-sm font-semibold text-slate-800">{{ t('grading.queue.feedback') }}</h4>
          <textarea v-model="feedback" class="input mt-2" rows="4" :placeholder="t('grading.queue.feedbackPlaceholder')"></textarea>

          <div class="mt-5 flex flex-wrap gap-2">
            <button v-can="'grading.update'" class="btn-outline" :disabled="saving" @click="saveGrade">
              {{ saving ? t('common.state.saving') : t('grading.queue.saveDraft') }}
            </button>
            <button v-can="'grading.update'" class="btn-outline text-amber-700" @click="showRevision = !showRevision">
              {{ t('grading.queue.requestRevision') }}
            </button>
            <button v-can="'grading.update'" class="btn-primary" :disabled="releasing || (rubric.length > 0 && !isComplete)" @click="releaseGrade">
              {{ releasing ? t('grading.queue.releasing') : t('grading.queue.release') }}
            </button>
          </div>

          <div v-if="showRevision" class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <label class="label">{{ t('grading.queue.revisionLabel') }}</label>
            <textarea v-model="revisionNote" class="input" rows="3" :placeholder="t('grading.queue.revisionPlaceholder')"></textarea>
            <button class="btn-primary mt-2 bg-amber-600 hover:bg-amber-700" :disabled="revisionSubmitting || !revisionNote.trim()" @click="submitRevision">
              {{ revisionSubmitting ? t('grading.queue.sending') : t('grading.queue.sendRevision') }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
