<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { fmtRp } from '@/lib/format';
import { levelLabel } from '@/lib/labels';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

interface CourseRow extends Record<string, unknown> {
  id: string;
  judul: string;
  slug: string;
  category_nama: string | null;
  instructor_id: string;
  instructor_nama: string | null;
  level: string;
  harga: string;
  status_publikasi: string;
  created_at: string;
}
interface Category {
  id: string;
  nama: string;
}

const auth = useAuthStore();
const { t } = useI18n();

const rows = ref<CourseRow[]>([]);
const categories = ref<Category[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 20;

const q = ref('');
const statusFilter = ref('');
const categoryFilter = ref('');
// Cakupan awal mengikuti siapa yang membuka halaman. Untuk instruktur, "kursus
// saya" memang yang dicari lebih dulu. Untuk admin yang tidak mengampu kursus,
// cakupan itu selalu menghasilkan tabel kosong — halaman terbaca seperti tidak
// ada kursus sama sekali padahal isinya penuh.
const onlyMine = ref(auth.roles.includes('instruktur') || auth.roles.includes('asisten'));

const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

const columns = computed(() => [
  { key: 'judul', label: t('courses.list.colCourse') },
  { key: 'category_nama', label: t('courses.list.colCategory') },
  { key: 'level', label: t('courses.list.colLevel') },
  { key: 'harga', label: t('courses.list.colPrice') },
  { key: 'status_publikasi', label: t('courses.list.colStatus') },
]);

const STATUS_OPTIONS = ['draf', 'dalam_review', 'terbit', 'diperbarui', 'diarsip'];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<CourseRow[]>('/courses', {
      page: page.value,
      limit,
      q: q.value || undefined,
      'filter[status]': statusFilter.value || undefined,
      'filter[category_id]': categoryFilter.value || undefined,
      'filter[instructor_id]': onlyMine.value ? auth.user?.id : undefined,
    });
    rows.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? rows.value.length;
  } catch (e) {
    error.value = errorMessage(e, t('courses.list.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  try {
    categories.value = await apiGetFull<Category[]>('/categories', { limit: 100 }).then((r) => r.data ?? []);
  } catch {
    categories.value = [];
  }
}

function search() {
  page.value = 1;
  load();
}

async function submitReview(id: string) {
  busyId.value = id;
  try {
    await apiPost(`/courses/${id}/submit`);
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('courses.list.submitFailed'));
  } finally {
    busyId.value = null;
  }
}
async function publish(id: string) {
  busyId.value = id;
  try {
    await apiPost(`/courses/${id}/publish`, {});
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('courses.list.publishFailed'));
  } finally {
    busyId.value = null;
  }
}
async function archive(id: string) {
  busyId.value = id;
  try {
    await apiPost(`/courses/${id}/archive`, {});
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('courses.list.archiveFailed'));
  } finally {
    busyId.value = null;
  }
}

watch(page, load);
watch(onlyMine, search);
onMounted(() => {
  loadCategories();
  load();
});
</script>

<template>
  <div>
    <PageHeader :title="t('courses.list.title')" :subtitle="t('courses.list.subtitle')">
      <template #actions>
        <RouterLink v-can="'kursus.create'" to="/d/kursus/tambah" class="btn-primary">{{ t('courses.list.add') }}</RouterLink>
      </template>
    </PageHeader>

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('courses.list.empty')">
      <template #toolbar>
        <input v-model="q" class="input max-w-xs" :placeholder="t('courses.list.searchPlaceholder')" @keyup.enter="search" />
        <select v-model="statusFilter" class="input w-auto" @change="search">
          <option value="">{{ t('courses.list.allStatus') }}</option>
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ t(`courses.status.${s}`) }}</option>
        </select>
        <select v-model="categoryFilter" class="input w-auto" @change="search">
          <option value="">{{ t('courses.list.allCategories') }}</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.nama }}</option>
        </select>
        <select v-model="onlyMine" class="input w-auto">
          <option :value="false">{{ t('courses.list.scopeAll') }}</option>
          <option :value="true">{{ t('courses.list.scopeMine') }}</option>
        </select>
        <button class="btn-outline" @click="search">{{ t('common.action.search') }}</button>
      </template>
      <template #cell:judul="{ row }">
        <div class="font-medium text-slate-800">{{ (row as unknown as CourseRow).judul }}</div>
        <div class="text-xs text-slate-400">{{ (row as unknown as CourseRow).instructor_nama || '—' }}</div>
      </template>
      <template #cell:level="{ value }">{{ levelLabel(String(value)) }}</template>
      <template #cell:harga="{ value }">{{ fmtRp(value as string | number) }}</template>
      <template #cell:status_publikasi="{ value }">
        <StatusChip :status="String(value)" />
      </template>
      <template #actions="{ row }">
        <div class="flex flex-wrap justify-end gap-2">
          <button
            v-if="(row as unknown as CourseRow).status_publikasi === 'draf'"
            v-can="'kursus.update'"
            class="row-link row-link-primary"
            :disabled="busyId === (row as unknown as CourseRow).id"
            @click="submitReview((row as unknown as CourseRow).id)"
          >
            {{ t('courses.list.submitReview') }}
          </button>
          <button
            v-if="['dalam_review', 'diperbarui'].includes((row as unknown as CourseRow).status_publikasi)"
            v-can="'kursus.update'"
            class="row-link row-link-positive"
            :disabled="busyId === (row as unknown as CourseRow).id"
            @click="publish((row as unknown as CourseRow).id)"
          >
            {{ t('courses.list.publish') }}
          </button>
          <button
            v-if="!['diarsip'].includes((row as unknown as CourseRow).status_publikasi)"
            v-can="'kursus.update'"
            class="row-link row-link-danger"
            :disabled="busyId === (row as unknown as CourseRow).id"
            @click="archive((row as unknown as CourseRow).id)"
          >
            {{ t('courses.list.archive') }}
          </button>
          <RouterLink :to="`/d/kursus/${(row as unknown as CourseRow).id}`" class="row-link">
            {{ t('courses.list.edit') }}
          </RouterLink>
        </div>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event" />
      </template>
    </DataTable>
  </div>
</template>
