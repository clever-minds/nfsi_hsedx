<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, errorMessage } from '@/lib/api';
import DataTable from '@/components/ui/DataTable.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import PageHeader from '@/components/ui/PageHeader.vue';

interface AssessmentColumn {
  id: string;
  judul: string;
}
interface StudentRow {
  siswa_id: string;
  siswa_nama: string;
  scores?: Record<string, number | string | null>;
  nilai_akhir?: number | null;
  status?: string;
  disesuaikan?: boolean;
}
interface GradebookData {
  kursus_judul?: string;
  asesmen?: AssessmentColumn[];
  siswa?: StudentRow[];
  passing_score?: number;
  rata_rata?: number;
  median?: number;
}
interface CourseOption {
  id: string;
  judul: string;
}
interface GradebookRow extends Record<string, unknown> {
  siswa_nama: string;
  nilai_akhir: number | string;
  status: string;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const courseId = computed(() => (route.params.courseId as string) || '');

const courses = ref<CourseOption[]>([]);
const coursesLoading = ref(false);

const data = ref<GradebookData | null>(null);
const loading = ref(false);
const error = ref('');

async function loadCourses() {
  coursesLoading.value = true;
  try {
    // limit dinaikkan: ini pengisi dropdown, bukan tabel. Tanpa ini BE memakai
    // default 20, jadi pengajar dengan lebih dari 20 kursus terbit tidak bisa
    // memilih kursus ke-21 dan seterusnya di gradebook.
    const res = await apiGetFull<CourseOption[]>('/courses', { status: 'terbit,diperbarui', limit: 100 });
    courses.value = res.data ?? [];
  } catch {
    courses.value = [];
  } finally {
    coursesLoading.value = false;
  }
}

async function loadGradebook() {
  if (!courseId.value) return;
  loading.value = true;
  error.value = '';
  try {
    data.value = await apiGet<GradebookData>(`/courses/${courseId.value}/gradebook`);
  } catch (e) {
    error.value = errorMessage(e, t('grading.gradebook.loadFailed'));
    data.value = null;
  } finally {
    loading.value = false;
  }
}

function selectCourse(id: string) {
  router.push({ name: 'gradebook', params: { courseId: id } });
}

const columns = computed(() => [
  { key: 'siswa_nama', label: t('grading.gradebook.colStudent') },
  ...(data.value?.asesmen ?? []).map((a) => ({ key: a.id, label: a.judul })),
  { key: 'nilai_akhir', label: t('grading.gradebook.colFinal') },
  { key: 'status', label: t('grading.gradebook.colStatus') },
]);

const rows = computed<GradebookRow[]>(() =>
  (data.value?.siswa ?? []).map((s) => {
    const rec: GradebookRow = {
      siswa_nama: s.siswa_nama,
      nilai_akhir: s.nilai_akhir ?? '—',
      status: s.status || 'berjalan',
    };
    (data.value?.asesmen ?? []).forEach((a) => {
      rec[a.id] = s.scores?.[a.id] ?? t('grading.gradebook.notGraded');
    });
    if (s.disesuaikan) rec.status = t('grading.gradebook.adjusted', { status: rec.status });
    return rec;
  }),
);

async function exportGradebook(format: 'excel' | 'pdf') {
  if (!courseId.value) return;
  try {
    window.open(`/api/v1/courses/${courseId.value}/gradebook/export?format=${format}`, '_blank');
  } catch (e) {
    error.value = errorMessage(e, t('grading.gradebook.exportFailed'));
  }
}

watch(courseId, loadGradebook);

onMounted(() => {
  if (!courseId.value) loadCourses();
  else loadGradebook();
});
</script>

<template>
  <div>
    <PageHeader
      :title="t('grading.gradebook.title')"
      :subtitle="
        data?.kursus_judul
          ? t('grading.gradebook.subtitleWith', { course: data.kursus_judul })
          : t('grading.gradebook.subtitle')
      "
    >
      <template #actions>
        <button v-if="courseId" v-can="'grading.view'" class="btn-outline" @click="exportGradebook('excel')">
          {{ t('grading.gradebook.exportExcel') }}
        </button>
      </template>
    </PageHeader>

    <div v-if="!courseId" class="card p-6">
      <h3 class="card-title">{{ t('grading.gradebook.pickCourse') }}</h3>
      <div v-if="coursesLoading" class="mt-3 text-sm text-slate-400">{{ t('grading.gradebook.loadingCourses') }}</div>
      <div v-else-if="!courses.length" class="mt-3 text-sm text-slate-400">{{ t('grading.gradebook.noCourses') }}</div>
      <div v-else class="mt-3 flex flex-wrap gap-2">
        <button v-for="c in courses" :key="c.id" class="btn-outline" @click="selectCourse(c.id)">{{ c.judul }}</button>
      </div>
    </div>

    <template v-else>
      <div v-if="loading" class="text-slate-400">{{ t('grading.gradebook.loading') }}</div>
      <div v-else-if="error" class="card p-6 text-slate-500">{{ error }}</div>
      <div v-else-if="data">
        <div class="mb-4 grid gap-4 sm:grid-cols-3">
          <KpiCard :label="t('grading.gradebook.classAverage')" :value="data.rata_rata ?? '—'" />
          <KpiCard :label="t('grading.gradebook.median')" :value="data.median ?? '—'" />
          <KpiCard :label="t('grading.gradebook.passingScore')" :value="data.passing_score ?? '—'" />
        </div>

        <div class="overflow-x-auto">
          <DataTable :columns="columns" :rows="rows" :loading="false" :empty="t('grading.gradebook.empty')">
            <template #cell:status="{ value }"><StatusChip :status="String(value)" /></template>
          </DataTable>
        </div>
      </div>
    </template>
  </div>
</template>
