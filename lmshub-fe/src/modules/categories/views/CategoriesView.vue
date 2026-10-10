<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import Icon from '@/components/ui/Icon.vue';

/**
 * Master data category course — dan tag, yang memakai izin serta endpointst yang
 * sama. Backend sudah lama menyediakan CRUD-nya, tapi no ada layar yang
 * memanggilnya: category hanya muncul sebagai dropdown di editor course.
 * Karena `courses.category_id` NOT NULL, pemasangan baru yang belum punya satu
 * category pun no bisa membuat course sama sekali.
 */
interface Category extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ikon: string | null;
  sort_order: number;
  is_active: boolean;
  amount_kursus: number;
}

interface Tag extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
}

const auth = useAuthStore();
const { t } = useI18n();
const canCreate = auth.can('category.create');
const canUpdate = auth.can('category.update');
const canDelete = auth.can('category.delete');

// ── Kategori ──────────────────────────────────────────────────────────────

const rows = ref<Category[]>([]);
const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);

const q = ref('');
const statusFilter = ref<'' | 'true' | 'false'>('');

const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref('');

const form = reactive({
  name: '',
  slug: '',
  description: '',
  ikon: '',
  sort_order: 0,
  is_active: true,
});

const columns = computed(() => [
  { key: 'name', label: t('categories.colName') },
  { key: 'sort_order', label: t('categories.colOrder') },
  { key: 'amount_kursus', label: t('categories.colCourses') },
  { key: 'is_active', label: t('categories.colStatus') },
]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, unknown> = { limit: 100, sort: 'sort_order', order: 'asc' };
    if (q.value.trim()) params.q = q.value.trim();
    if (statusFilter.value) params['filter[is_active]'] = statusFilter.value;
    const res = await apiGetFull<Category[]>('/categories', params);
    rows.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('categories.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  formError.value = '';
  Object.assign(form, { name: '', slug: '', description: '', ikon: '', sort_order: 0, is_active: true });
}

function openCreate() {
  resetForm();
  // Kategori baru diletakkan di belakang; sort_order 0 akan menyelipkannya di depan
  // category yang sudah ditata rapi by admin.
  form.sort_order = rows.value.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
  showForm.value = true;
}

function openEdit(row: Category) {
  editingId.value = row.id;
  formError.value = '';
  Object.assign(form, {
    name: row.name,
    slug: row.slug,
    description: row.description ?? '',
    ikon: row.ikon ?? '',
    sort_order: row.sort_order,
    is_active: row.is_active,
  });
  showForm.value = true;
}

async function submit() {
  if (form.name.trim().length < 2) {
    formError.value = t('categories.nameRequired');
    return;
  }
  saving.value = true;
  formError.value = '';
  // `slug` dikosongkan berarti "turunkan from name" — backend yang membuatnya.
  // send `undefined`, bukan string kosong: skemanya menolak slug < 2 karakter.
  const payload = {
    name: form.name.trim(),
    slug: form.slug.trim() || undefined,
    description: form.description.trim() || null,
    ikon: form.ikon.trim() || null,
    sort_order: Number(form.sort_order) || 0,
    is_active: form.is_active,
  };
  try {
    if (editingId.value) await apiPut(`/categories/${editingId.value}`, payload);
    else await apiPost('/categories', payload);
    showForm.value = false;
    resetForm();
    await load();
  } catch (e) {
    formError.value = errorMessage(e, t('categories.saveFailed'));
  } finally {
    saving.value = false;
  }
}

/** active/nonaktif cepat — jalan logout untuk category yang tak bisa dihapus. */
async function toggleAktif(row: Category) {
  busyId.value = row.id;
  error.value = '';
  try {
    await apiPut(`/categories/${row.id}`, { is_active: !row.is_active });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('categories.saveFailed'));
  } finally {
    busyId.value = null;
  }
}

async function remove(row: Category) {
  if (!window.confirm(t('categories.confirmDelete', { name: row.name }))) return;
  busyId.value = row.id;
  error.value = '';
  try {
    await apiDelete(`/categories/${row.id}`);
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('categories.deleteFailed'));
  } finally {
    busyId.value = null;
  }
}

// ── Tag ───────────────────────────────────────────────────────────────────

const tags = ref<Tag[]>([]);
const tagsLoading = ref(true);
const tagError = ref('');
const tagBusyId = ref<string | null>(null);
const tagNama = ref('');
const tagSaving = ref(false);
const tagEditingId = ref<string | null>(null);

const tagColumns = computed(() => [
  { key: 'name', label: t('categories.tagColName') },
  { key: 'slug', label: t('categories.tagColSlug') },
]);

async function loadTags() {
  tagsLoading.value = true;
  tagError.value = '';
  try {
    const res = await apiGetFull<Tag[]>('/categories/tags', { limit: 100 });
    tags.value = res.data ?? [];
  } catch (e) {
    tagError.value = errorMessage(e, t('categories.tagLoadFailed'));
    tags.value = [];
  } finally {
    tagsLoading.value = false;
  }
}

async function submitTag() {
  const name = tagNama.value.trim();
  if (name.length < 2) {
    tagError.value = t('categories.tagNameRequired');
    return;
  }
  tagSaving.value = true;
  tagError.value = '';
  try {
    if (tagEditingId.value) await apiPut(`/categories/tags/${tagEditingId.value}`, { name });
    else await apiPost('/categories/tags', { name });
    tagNama.value = '';
    tagEditingId.value = null;
    await loadTags();
  } catch (e) {
    tagError.value = errorMessage(e, t('categories.tagSaveFailed'));
  } finally {
    tagSaving.value = false;
  }
}

function editTag(row: Tag) {
  tagEditingId.value = row.id;
  tagNama.value = row.name;
  tagError.value = '';
}

function cancelTagEdit() {
  tagEditingId.value = null;
  tagNama.value = '';
  tagError.value = '';
}

async function removeTag(row: Tag) {
  if (!window.confirm(t('categories.tagConfirmDelete', { name: row.name }))) return;
  tagBusyId.value = row.id;
  tagError.value = '';
  try {
    await apiDelete(`/categories/tags/${row.id}`);
    if (tagEditingId.value === row.id) cancelTagEdit();
    await loadTags();
  } catch (e) {
    tagError.value = errorMessage(e, t('categories.tagDeleteFailed'));
  } finally {
    tagBusyId.value = null;
  }
}

onMounted(() => {
  load();
  loadTags();
});
</script>

<template>
  <div>
    <PageHeader :title="t('categories.title')" :subtitle="t('categories.subtitle')">
      <template #actions>
        <button v-if="canCreate" class="btn-primary" @click="openCreate">{{ t('categories.add') }}</button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <!-- Formulir add/edit category -->
    <div v-if="showForm" class="card mb-4 p-5">
      <h3 class="card-title">
        {{ editingId ? t('categories.formTitleEdit') : t('categories.formTitleNew') }}
      </h3>
      <div v-if="formError" class="mt-2 alert-error">{{ formError }}</div>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label">{{ t('categories.colName') }}</label>
          <input v-model="form.name" class="input" :placeholder="t('categories.namePlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('categories.slug') }}</label>
          <input v-model="form.slug" class="input" :placeholder="t('categories.slugPlaceholder')" />
          <p class="mt-1 text-xs text-slate-400">{{ t('categories.slugHint') }}</p>
        </div>
        <div class="sm:col-span-2">
          <label class="label">{{ t('categories.description') }}</label>
          <textarea
            v-model="form.description"
            rows="2"
            class="input"
            :placeholder="t('categories.descriptionPlaceholder')"
          ></textarea>
        </div>
        <div>
          <label class="label">{{ t('categories.icon') }}</label>
          <input v-model="form.ikon" class="input" :placeholder="t('categories.iconPlaceholder')" />
        </div>
        <div>
          <label class="label">{{ t('categories.colOrder') }}</label>
          <input v-model.number="form.sort_order" type="number" min="0" class="input" />
        </div>
        <div class="flex items-end pb-1">
          <label class="label-inline">
            <input v-model="form.is_active" type="checkbox" /> {{ t('categories.active') }}
          </label>
        </div>
      </div>

      <div class="mt-4 flex justify-end gap-2">
        <button class="btn-outline" @click="showForm = false">{{ t('common.action.cancel') }}</button>
        <button class="btn-primary" :disabled="saving" @click="submit">
          {{ saving ? t('common.state.saving') : t('common.action.save') }}
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('categories.empty')">
      <template #toolbar>
        <div>
          <label class="label">{{ t('common.action.search') }}</label>
          <input
            v-model="q"
            class="input"
            :placeholder="t('categories.searchPlaceholder')"
            @keyup.enter="load"
          />
        </div>
        <div>
          <label class="label">{{ t('categories.colStatus') }}</label>
          <select v-model="statusFilter" class="input" @change="load">
            <option value="">{{ t('categories.filterAll') }}</option>
            <option value="true">{{ t('categories.active') }}</option>
            <option value="false">{{ t('categories.inactive') }}</option>
          </select>
        </div>
        <button class="btn-outline" @click="load">{{ t('common.action.apply') }}</button>
      </template>

      <template #cell:name="{ row }">
        <div class="font-medium text-slate-800">{{ (row as unknown as Category).name }}</div>
        <div class="text-xs text-slate-400">
          /{{ (row as unknown as Category).slug }}
          <span v-if="(row as unknown as Category).description">
            · {{ (row as unknown as Category).description }}
          </span>
        </div>
      </template>

      <template #cell:sort_order="{ value }">
        <span class="num">{{ value }}</span>
      </template>

      <template #cell:amount_kursus="{ value }">
        <span class="num">{{ value }}</span>
      </template>

      <template #cell:is_active="{ value }">
        <span
          class="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
        >
          {{ value ? t('categories.active') : t('categories.inactive') }}
        </span>
      </template>

      <template #actions="{ row }">
        <div class="flex flex-wrap justify-end gap-2">
          <button
            v-if="canUpdate"
            class="row-link"
            :disabled="busyId === (row as unknown as Category).id"
            @click="toggleAktif(row as unknown as Category)"
          >
            {{ (row as unknown as Category).is_active ? t('categories.deactivate') : t('categories.activate') }}
          </button>
          <button v-if="canUpdate" class="row-link" @click="openEdit(row as unknown as Category)">
            {{ t('common.action.edit') }}
          </button>
          <!-- Kategori yang masih dipakai course ditolak backend (FK RESTRICT).
               Tombolnya dimatikan di sini agar penolakan itu terbaca sebelum
               diklik, bukan sesudahnya. -->
          <button
            v-if="canDelete"
            class="row-link row-link-danger"
            :disabled="
              busyId === (row as unknown as Category).id || (row as unknown as Category).amount_kursus > 0
            "
            :title="(row as unknown as Category).amount_kursus > 0 ? t('categories.inUseHint') : ''"
            @click="remove(row as unknown as Category)"
          >
            {{ t('common.action.delete') }}
          </button>
        </div>
      </template>
    </DataTable>

    <p class="mt-3 flex items-start gap-1.5 text-xs text-slate-400">
      <Icon name="alert-circle" :size="14" class="mt-0.5 shrink-0" />
      {{ t('categories.hint') }}
    </p>

    <!-- ── Tag ─────────────────────────────────────────────────────────── -->
    <div class="mt-8">
      <h2 class="mb-1 text-lg font-medium text-slate-900">{{ t('categories.tagTitle') }}</h2>
      <p class="mb-3 text-sm text-slate-400">{{ t('categories.tagSubtitle') }}</p>

      <div v-if="tagError" class="mb-4 alert-error">{{ tagError }}</div>

      <DataTable
        :columns="tagColumns"
        :rows="tags"
        :loading="tagsLoading"
        :empty="t('categories.tagEmpty')"
      >
        <template v-if="canCreate || canUpdate" #toolbar>
          <div class="grow sm:grow-0">
            <label class="label">
              {{ tagEditingId ? t('categories.tagFormTitleEdit') : t('categories.tagFormTitleNew') }}
            </label>
            <input
              v-model="tagNama"
              class="input"
              :placeholder="t('categories.tagNamePlaceholder')"
              @keyup.enter="submitTag"
            />
          </div>
          <button class="btn-primary" :disabled="tagSaving" @click="submitTag">
            {{ tagSaving ? t('common.state.saving') : tagEditingId ? t('common.action.save') : t('common.action.add') }}
          </button>
          <button v-if="tagEditingId" class="btn-outline" @click="cancelTagEdit">
            {{ t('common.action.cancel') }}
          </button>
        </template>

        <template #cell:slug="{ value }">
          <span class="text-xs text-slate-400">/{{ value }}</span>
        </template>

        <template #actions="{ row }">
          <div class="flex flex-wrap justify-end gap-2">
            <button v-if="canUpdate" class="row-link" @click="editTag(row as unknown as Tag)">
              {{ t('common.action.edit') }}
            </button>
            <button
              v-if="canDelete"
              class="row-link row-link-danger"
              :disabled="tagBusyId === (row as unknown as Tag).id"
              @click="removeTag(row as unknown as Tag)"
            >
              {{ t('common.action.delete') }}
            </button>
          </div>
        </template>
      </DataTable>
    </div>
  </div>
</template>
