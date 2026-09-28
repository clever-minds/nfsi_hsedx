<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPatch, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka, fmtTanggalSaja } from '@/lib/format';
import DataTable from '@/components/ui/DataTable.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import TablePagination from '@/components/ui/TablePagination.vue';

interface Enrollment extends Record<string, unknown> {
  id: string;
  siswa_nama?: string;
  kursus_judul?: string;
  cohort_nama?: string;
  sumber?: string;
  status: string;
  tanggal_mulai?: string;
  tanggal_kedaluwarsa?: string;
}

interface Cohort extends Record<string, unknown> {
  id: string;
  nama: string;
  kursus_judul?: string;
  kapasitas: number;
  terisi?: number;
  waitlist_count?: number;
  tanggal_mulai?: string;
  tanggal_selesai?: string;
  status?: string;
}

interface WaitlistEntry extends Record<string, unknown> {
  id: string;
  siswa_nama: string;
  posisi?: number;
}

interface CohortMember extends Record<string, unknown> {
  id: string;
  siswa_nama: string;
  status?: string;
}

const { t } = useI18n();

const tab = ref<'enrollment' | 'cohort'>('enrollment');

// ── Tab: Enrollment ──
const enrollments = ref<Enrollment[]>([]);
const enrollLoading = ref(true);
const enrollError = ref('');
const meta = reactive({ page: 1, limit: 20, total: 0 });
const filterStatus = ref('');
const filterQuery = ref('');

const enrollmentColumns = computed(() => [
  { key: 'siswa_nama', label: t('enrollment.colStudent') },
  { key: 'kursus_judul', label: t('enrollment.colCourse') },
  { key: 'sumber', label: t('enrollment.colSource') },
  { key: 'status', label: t('enrollment.colStatus') },
  { key: 'cohort_nama', label: t('enrollment.colCohort') },
  { key: 'tanggal_kedaluwarsa', label: t('enrollment.colAccessUntil') },
]);

const STATUS_OPTIONS = ['terdaftar', 'aktif', 'selesai', 'kedaluwarsa', 'dibatalkan'];

async function loadEnrollments() {
  enrollLoading.value = true;
  enrollError.value = '';
  try {
    const res = await apiGetFull<Enrollment[]>('/enrollments', {
      status: filterStatus.value || undefined,
      q: filterQuery.value || undefined,
      page: meta.page,
      limit: meta.limit,
    });
    enrollments.value = res.data ?? [];
    const m = res.meta as Record<string, unknown> | null;
    meta.total = (m?.total as number) ?? enrollments.value.length;
  } catch (e) {
    enrollError.value = errorMessage(e, t('enrollment.loadFailed'));
    enrollments.value = [];
  } finally {
    enrollLoading.value = false;
  }
}

function applyFilter() {
  meta.page = 1;
  loadEnrollments();
}

// Assign manual
const showAssign = ref(false);
const assignForm = reactive({ siswaId: '', kursusId: '', alasan: '', aksesKebijakan: 'seumur_hidup' });
const assignSubmitting = ref(false);
const assignError = ref('');

async function submitAssign() {
  if (!assignForm.siswaId.trim() || !assignForm.kursusId.trim() || !assignForm.alasan.trim()) {
    assignError.value = t('enrollment.assignRequired');
    return;
  }
  assignSubmitting.value = true;
  assignError.value = '';
  try {
    await apiPost('/enrollments', {
      studentIds: assignForm.siswaId.split(',').map((s) => s.trim()).filter(Boolean),
      courseId: assignForm.kursusId.trim(),
      alasan: assignForm.alasan.trim(),
      accessPolicy: assignForm.aksesKebijakan,
    });
    showAssign.value = false;
    assignForm.siswaId = '';
    assignForm.kursusId = '';
    assignForm.alasan = '';
    await loadEnrollments();
  } catch (e) {
    assignError.value = errorMessage(e, t('enrollment.assignFailed'));
  } finally {
    assignSubmitting.value = false;
  }
}

// Cabut akses
const revokeTarget = ref<Enrollment | null>(null);
const revokeReason = ref('');
const revokeSubmitting = ref(false);
const revokeError = ref('');

function openRevoke(row: Enrollment) {
  revokeTarget.value = row;
  revokeReason.value = '';
  revokeError.value = '';
}

async function submitRevoke() {
  if (!revokeTarget.value) return;
  if (!revokeReason.value.trim()) {
    revokeError.value = t('enrollment.revokeRequired');
    return;
  }
  revokeSubmitting.value = true;
  revokeError.value = '';
  try {
    await apiPost(`/enrollments/${revokeTarget.value.id}/revoke`, { alasan: revokeReason.value.trim() });
    revokeTarget.value = null;
    await loadEnrollments();
  } catch (e) {
    revokeError.value = errorMessage(e, t('enrollment.revokeFailed'));
  } finally {
    revokeSubmitting.value = false;
  }
}

// ── Tab: Cohort ──
const cohorts = ref<Cohort[]>([]);
const cohortLoading = ref(true);
const cohortError = ref('');
let cohortsLoaded = false;

const cohortColumns = computed(() => [
  { key: 'nama', label: t('enrollment.colCohortName') },
  { key: 'kursus_judul', label: t('enrollment.colCourse') },
  { key: 'kapasitas_label', label: t('enrollment.colCapacity') },
  { key: 'periode', label: t('enrollment.colPeriod') },
  { key: 'status', label: t('enrollment.colStatus') },
]);

async function loadCohorts() {
  cohortLoading.value = true;
  cohortError.value = '';
  try {
    // (list cohort per kursus), belum ada endpoint list-semua-cohort lintas kursus.
    const res = await apiGetFull<Cohort[]>('/cohorts');
    cohorts.value = res.data ?? [];
  } catch (e) {
    cohortError.value = errorMessage(e, t('enrollment.cohortLoadFailed'));
    cohorts.value = [];
  } finally {
    cohortLoading.value = false;
    cohortsLoaded = true;
  }
}

const cohortRows = computed(() =>
  cohorts.value.map((c) => ({
    ...c,
    kapasitas_label: `${fmtAngka(c.terisi ?? 0)}/${fmtAngka(c.kapasitas)}${(c.terisi ?? 0) >= c.kapasitas ? t('enrollment.full') : ''}`,
    periode: c.tanggal_mulai
      ? `${fmtTanggalSaja(c.tanggal_mulai)} – ${c.tanggal_selesai ? fmtTanggalSaja(c.tanggal_selesai) : '?'}`
      : '—',
    status: c.status || 'terjadwal',
  })),
);

const selectedCohort = ref<Cohort | null>(null);
const members = ref<CohortMember[]>([]);
const waitlist = ref<WaitlistEntry[]>([]);
const membersLoading = ref(false);

async function openCohort(row: Cohort) {
  selectedCohort.value = row;
  membersLoading.value = true;
  try {
    const [m, w] = await Promise.all([
      apiGet<CohortMember[]>(`/cohorts/${row.id}/members`).catch(() => [] as CohortMember[]),
      apiGet<WaitlistEntry[]>(`/cohorts/${row.id}/waitlist`).catch(() => [] as WaitlistEntry[]),
    ]);
    members.value = m ?? [];
    waitlist.value = w ?? [];
  } finally {
    membersLoading.value = false;
  }
}

async function promote(entry: WaitlistEntry) {
  if (!selectedCohort.value) return;
  try {
    await apiPatch(`/cohorts/${selectedCohort.value.id}/waitlist/${entry.id}/promote`, {});
    await openCohort(selectedCohort.value);
    await loadCohorts();
  } catch (e) {
    cohortError.value = errorMessage(e, t('enrollment.promoteFailed'));
  }
}

function switchTab(next: 'enrollment' | 'cohort') {
  tab.value = next;
  if (next === 'cohort' && !cohortsLoaded) loadCohorts();
}

watch(() => meta.page, loadEnrollments);

onMounted(loadEnrollments);
</script>

<template>
  <div>
    <PageHeader :title="t('enrollment.title')" :subtitle="t('enrollment.subtitle')">
      <template #actions>
        <button v-if="tab === 'enrollment'" v-can="'enrollment.create'" class="btn-primary" @click="showAssign = !showAssign">
          {{ showAssign ? t('enrollment.close') : t('enrollment.assignBtn') }}
        </button>
      </template>
    </PageHeader>

    <div class="tab-bar mb-4">
      <button
        class="tab-item"
        :class="{ 'tab-item-active': tab === 'enrollment' }"
        @click="switchTab('enrollment')"
      >
        {{ t('enrollment.tabEnrollment') }}
      </button>
      <button
        v-can="'cohort.view'"
        class="tab-item"
        :class="{ 'tab-item-active': tab === 'cohort' }"
        @click="switchTab('cohort')"
      >
        {{ t('enrollment.tabCohort') }}
      </button>
    </div>

    <!-- ── Enrollment tab ── -->
    <div v-if="tab === 'enrollment'">
      <div v-if="showAssign" class="card mb-4 p-4">
        <h3 class="card-title">{{ t('enrollment.assignTitle') }}</h3>
        <p class="mt-1 text-xs text-slate-400">{{ t('enrollment.assignHint') }}</p>
        <div v-if="assignError" class="mt-2 alert-error">{{ assignError }}</div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">{{ t('enrollment.studentIds') }}</label>
            <input v-model="assignForm.siswaId" class="input" :placeholder="t('enrollment.studentIdsPlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('enrollment.courseId') }}</label>
            <input v-model="assignForm.kursusId" class="input" :placeholder="t('enrollment.courseIdPlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('enrollment.accessPeriod') }}</label>
            <select v-model="assignForm.aksesKebijakan" class="input">
              <option value="seumur_hidup">{{ t('enrollment.lifetime') }}</option>
              <option value="berlangganan">{{ t('enrollment.subscription') }}</option>
              <option value="kedaluwarsa">{{ t('enrollment.expiring') }}</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('enrollment.reason') }}</label>
            <input v-model="assignForm.alasan" class="input" :placeholder="t('enrollment.reasonPlaceholder')" />
          </div>
        </div>
        <div class="mt-3 flex justify-end gap-2">
          <button class="btn-outline" @click="showAssign = false">{{ t('common.action.cancel') }}</button>
          <button class="btn-primary" :disabled="assignSubmitting" @click="submitAssign">
            {{ assignSubmitting ? t('common.state.saving') : t('enrollment.assign') }}
          </button>
        </div>
      </div>

      <div v-if="enrollError" class="mb-4 alert-error">{{ enrollError }}</div>

      <DataTable :columns="enrollmentColumns" :rows="enrollments" :loading="enrollLoading" :empty="t('enrollment.empty')">
        <template #toolbar>
          <input
            v-model="filterQuery"
            class="input max-w-xs"
            :placeholder="t('enrollment.searchPlaceholder')"
            @keyup.enter="applyFilter"
          />
          <select v-model="filterStatus" class="input max-w-[10rem]" @change="applyFilter">
            <option value="">{{ t('enrollment.allStatus') }}</option>
            <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ t(`common.status.${s}`) }}</option>
          </select>
          <button class="btn-outline" @click="applyFilter">{{ t('enrollment.apply') }}</button>
        </template>
        <template #cell:sumber="{ value }">
          <StatusChip :status="String(value || '—')" />
        </template>
        <template #cell:status="{ value }">
          <StatusChip :status="String(value)" />
        </template>
        <template #cell:cohort_nama="{ value }">{{ value || '—' }}</template>
        <template #cell:tanggal_kedaluwarsa="{ value }">
          {{ value ? fmtTanggalSaja(String(value)) : t('enrollment.lifetime') }}
        </template>
        <template #actions="{ row }">
          <button v-can="'enrollment.update'" class="row-link row-link-danger" @click="openRevoke(row as Enrollment)">
            {{ t('enrollment.revoke') }}
          </button>
        </template>
        <template #footer>
          <TablePagination :page="meta.page" :limit="meta.limit" :total="meta.total" @update:page="meta.page = $event" />
        </template>
      </DataTable>

      <!-- Modal cabut akses -->
      <div v-if="revokeTarget" class="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
        <div class="card w-full max-w-md p-5">
          <h3 class="card-title">
            {{ t('enrollment.revokeTitle', { name: revokeTarget.siswa_nama || revokeTarget.id }) }}
          </h3>
          <p class="mt-1 text-xs text-slate-400">{{ t('enrollment.revokeHint') }}</p>
          <div v-if="revokeError" class="mt-2 alert-error">{{ revokeError }}</div>
          <div class="mt-3">
            <label class="label">{{ t('enrollment.reason') }}</label>
            <textarea v-model="revokeReason" class="input" rows="3" :placeholder="t('enrollment.revokePlaceholder')"></textarea>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button class="btn-outline" @click="revokeTarget = null">{{ t('common.action.cancel') }}</button>
            <button class="btn-primary bg-rose-600 hover:bg-rose-700" :disabled="revokeSubmitting" @click="submitRevoke">
              {{ revokeSubmitting ? t('enrollment.processing') : t('enrollment.revoke') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Cohort tab ── -->
    <div v-else>
      <div v-if="cohortError" class="mb-4 alert-error">{{ cohortError }}</div>

      <DataTable :columns="cohortColumns" :rows="cohortRows" :loading="cohortLoading" :empty="t('enrollment.cohortEmpty')">
        <template #cell:status="{ value }"><StatusChip :status="String(value)" /></template>
        <template #actions="{ row }">
          <button class="row-link row-link-primary" @click="openCohort(row as Cohort)">
            {{ t('enrollment.manage') }}
          </button>
        </template>
      </DataTable>

      <div v-if="selectedCohort" class="card mt-4 p-4">
        <div class="flex items-center justify-between">
          <h3 class="card-title">{{ t('enrollment.membersTitle', { name: selectedCohort.nama }) }}</h3>
          <button class="text-xs text-slate-400 hover:text-slate-600" @click="selectedCohort = null">
            {{ t('enrollment.close') }}
          </button>
        </div>

        <div v-if="membersLoading" class="mt-4 text-sm text-slate-400">{{ t('common.state.loading') }}</div>
        <div v-else class="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {{ t('enrollment.activeMembers', { n: fmtAngka(members.length) }) }}
            </h4>
            <ul v-if="members.length" class="mt-2 space-y-1 text-sm text-slate-700">
              <li v-for="m in members" :key="m.id" class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>{{ m.siswa_nama }}</span>
                <StatusChip :status="m.status || 'aktif'" />
              </li>
            </ul>
            <p v-else class="mt-2 text-sm text-slate-400">{{ t('enrollment.noMembers') }}</p>
          </div>
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {{ t('enrollment.waitlist', { n: fmtAngka(waitlist.length) }) }}
            </h4>
            <ul v-if="waitlist.length" class="mt-2 space-y-1 text-sm text-slate-700">
              <li v-for="w in waitlist" :key="w.id" class="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                <span>#{{ w.posisi ?? '?' }} — {{ w.siswa_nama }}</span>
                <button v-can="'enrollment.update'" class="row-link row-link-primary" @click="promote(w)">
                  {{ t('enrollment.promote') }}
                </button>
              </li>
            </ul>
            <p v-else class="mt-2 text-sm text-slate-400">{{ t('enrollment.waitlistEmpty') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
