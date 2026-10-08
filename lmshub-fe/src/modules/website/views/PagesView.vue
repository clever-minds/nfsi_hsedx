<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtRelatif } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import { useSiteContentStore } from '@/stores/siteContent';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import RichTextEditor from '@/components/ui/RichTextEditor.vue';

/**
 * Halaman statis situs — About, Help Center, Privacy, Terms, Contact, dan
 * halaman lain yang dibuat admin. Halaman bertanda "Tampil di footer" muncul
 * di kolom Support footer, berurutan menurut angka urutannya.
 *
 * Backend sudah lama menyimpan `content_pages`, tetapi tidak ada layar yang
 * mengelolanya dan footer menautkan semuanya ke `#`.
 */
interface ContentPage extends Record<string, unknown> {
  id: string;
  slug: string;
  title: string;
  content: { format?: string; html?: string } | null;
  tipe: 'tentang' | 'faq' | 'kebijakan' | 'halaman';
  status: 'draft' | 'terbit' | 'arsip';
  tampil_di_footer: boolean;
  urutan_footer: number;
  updated_at: string;
}

const auth = useAuthStore();
const site = useSiteContentStore();
const { t } = useI18n();
const canEdit = auth.can('pengaturan.update');

const rows = ref<ContentPage[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const busyId = ref<string | null>(null);

const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref('');
/** Slug mengikuti title sampai admin mengetiknya sendiri. */
const slugTouched = ref(false);

const form = reactive({
  title: '',
  slug: '',
  tipe: 'halaman' as ContentPage['tipe'],
  status: 'draft' as ContentPage['status'],
  tampil_di_footer: false,
  urutan_footer: 0,
  html: '',
});

const TIPE = ['tentang', 'faq', 'kebijakan', 'halaman'] as const;
const STATUS = ['draft', 'terbit', 'arsip'] as const;

const columns = computed(() => [
  { key: 'title', label: t('pages.admin.colTitle') },
  { key: 'status', label: t('pages.admin.colStatus') },
  { key: 'tampil_di_footer', label: t('pages.admin.colFooter') },
  { key: 'updated_at', label: t('pages.admin.colUpdated') },
]);

function slugify(v: string) {
  return v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

function onTitle() {
  if (!editingId.value && !slugTouched.value) form.slug = slugify(form.title);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<ContentPage[]>('/pages', { limit: 100 });
    rows.value = (res.data ?? []).sort(
      (a, b) => Number(b.tampil_di_footer) - Number(a.tampil_di_footer) || a.urutan_footer - b.urutan_footer || a.title.localeCompare(b.title),
    );
  } catch (e) {
    error.value = errorMessage(e, t('pages.admin.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  slugTouched.value = false;
  formError.value = '';
  Object.assign(form, {
    title: '',
    slug: '',
    tipe: 'halaman',
    status: 'draft',
    tampil_di_footer: false,
    urutan_footer: rows.value.reduce((m, r) => Math.max(m, r.urutan_footer), 0) + 1,
    html: '',
  });
  showForm.value = true;
}

function openEdit(row: ContentPage) {
  editingId.value = row.id;
  slugTouched.value = true;
  formError.value = '';
  Object.assign(form, {
    title: row.title,
    slug: row.slug,
    tipe: row.tipe,
    status: row.status,
    tampil_di_footer: row.tampil_di_footer,
    urutan_footer: row.urutan_footer,
    html: row.content?.html ?? '',
  });
  showForm.value = true;
  requestAnimationFrame(() => document.getElementById('page-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function submit() {
  formError.value = '';
  if (form.title.trim().length < 2) {
    formError.value = t('pages.admin.titleRequired');
    return;
  }
  if (!/^[a-z0-9-]{2,150}$/.test(form.slug)) {
    formError.value = t('pages.admin.slugInvalid');
    return;
  }
  saving.value = true;
  const payload = {
    title: form.title.trim(),
    slug: form.slug,
    tipe: form.tipe,
    status: form.status,
    tampil_di_footer: form.tampil_di_footer,
    urutan_footer: Number(form.urutan_footer) || 0,
    konten_html: form.html,
  };
  try {
    if (editingId.value) await apiPut(`/pages/${editingId.value}`, payload);
    else await apiPost('/pages', payload);
    showForm.value = false;
    notice.value = t('pages.admin.saved');
    await Promise.all([load(), site.loadHalaman()]);
  } catch (e) {
    formError.value = errorMessage(e, t('pages.admin.saveFailed'));
  } finally {
    saving.value = false;
  }
}

/** Terbit ↔ draft cepat dari tabel. */
async function togglePublish(row: ContentPage) {
  busyId.value = row.id;
  error.value = '';
  try {
    await apiPut(`/pages/${row.id}`, { status: row.status === 'terbit' ? 'draft' : 'terbit' });
    await Promise.all([load(), site.loadHalaman()]);
  } catch (e) {
    error.value = errorMessage(e, t('pages.admin.saveFailed'));
  } finally {
    busyId.value = null;
  }
}

async function remove(row: ContentPage) {
  if (!window.confirm(t('pages.admin.confirmDelete', { title: row.title }))) return;
  busyId.value = row.id;
  error.value = '';
  try {
    await apiDelete(`/pages/${row.id}`);
    if (editingId.value === row.id) showForm.value = false;
    await Promise.all([load(), site.loadHalaman()]);
  } catch (e) {
    error.value = errorMessage(e, t('pages.admin.deleteFailed'));
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('pages.admin.title')" :subtitle="t('pages.admin.subtitle')">
      <template #actions>
        <button v-if="canEdit" class="btn-primary" @click="openCreate">{{ t('pages.admin.add') }}</button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>
    <div v-if="notice && !showForm" class="mb-4 alert-success">{{ notice }}</div>

    <div v-if="showForm" id="page-form" class="card mb-4 scroll-mt-24 p-5">
      <h3 class="card-title">{{ editingId ? t('pages.admin.formTitleEdit') : t('pages.admin.formTitleNew') }}</h3>
      <div v-if="formError" class="mt-2 alert-error">{{ formError }}</div>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="page-title">{{ t('pages.admin.colTitle') }}</label>
          <input id="page-title" v-model="form.title" class="input" maxlength="200" :disabled="!canEdit" @input="onTitle" />
        </div>
        <div>
          <label class="label" for="page-slug">{{ t('pages.admin.slug') }}</label>
          <div class="flex items-center gap-1">
            <span class="text-sm text-slate-400">/pages/</span>
            <input
              id="page-slug"
              v-model="form.slug"
              class="input"
              maxlength="150"
              :disabled="!canEdit"
              @input="slugTouched = true"
            />
          </div>
          <p class="mt-1 text-xs text-slate-400">{{ t('pages.admin.slugHint') }}</p>
        </div>
        <div>
          <label class="label" for="page-type">{{ t('pages.admin.type') }}</label>
          <select id="page-type" v-model="form.tipe" class="input" :disabled="!canEdit">
            <option v-for="x in TIPE" :key="x" :value="x">{{ t(`pages.tipe.${x}`) }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="page-status">{{ t('pages.admin.colStatus') }}</label>
          <select id="page-status" v-model="form.status" class="input" :disabled="!canEdit">
            <option v-for="x in STATUS" :key="x" :value="x">{{ t(`pages.status.${x}`) }}</option>
          </select>
          <p class="mt-1 text-xs text-slate-400">{{ t('pages.admin.statusHint') }}</p>
        </div>
        <div class="flex items-end gap-4 pb-1">
          <label class="label-inline">
            <input v-model="form.tampil_di_footer" type="checkbox" :disabled="!canEdit" /> {{ t('pages.admin.showInFooter') }}
          </label>
        </div>
        <div>
          <label class="label" for="page-order">{{ t('pages.admin.footerOrder') }}</label>
          <input id="page-order" v-model.number="form.urutan_footer" type="number" min="0" max="999" class="input" :disabled="!canEdit" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">{{ t('pages.admin.content') }}</label>
          <RichTextEditor v-model="form.html" :disabled="!canEdit" />
          <p class="mt-1 text-xs text-slate-400">{{ t('pages.admin.contentHint') }}</p>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <a
          v-if="editingId && form.status === 'terbit'"
          :href="`/pages/${form.slug}`"
          target="_blank"
          rel="noopener"
          class="btn-outline me-auto"
        >
          {{ t('pages.admin.view') }}
        </a>
        <button class="btn-outline" @click="showForm = false">{{ t('common.action.cancel') }}</button>
        <button v-if="canEdit" class="btn-primary" :disabled="saving" @click="submit">
          {{ saving ? t('common.state.saving') : t('common.action.save') }}
        </button>
      </div>
    </div>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('pages.admin.empty')">
      <template #cell:title="{ row }">
        <div class="font-medium text-slate-800">{{ (row as ContentPage).title }}</div>
        <div class="text-xs text-slate-400">/pages/{{ (row as ContentPage).slug }}</div>
      </template>
      <template #cell:status="{ row }">
        <span
          class="rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="(row as ContentPage).status === 'terbit' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'"
        >
          {{ t(`pages.status.${(row as ContentPage).status}`) }}
        </span>
      </template>
      <template #cell:tampil_di_footer="{ row }">
        <span v-if="(row as ContentPage).tampil_di_footer" class="text-sm text-slate-600">
          ✓ <span class="num text-xs text-slate-400">#{{ (row as ContentPage).urutan_footer }}</span>
        </span>
        <span v-else class="text-slate-300">—</span>
      </template>
      <template #cell:updated_at="{ value }">{{ fmtRelatif(String(value)) }}</template>
      <template #actions="{ row }">
        <div class="flex justify-end gap-1.5">
          <a
            v-if="(row as ContentPage).status === 'terbit'"
            :href="`/pages/${(row as ContentPage).slug}`"
            target="_blank"
            rel="noopener"
            class="btn-outline btn-sm"
          >
            {{ t('pages.admin.view') }}
          </a>
          <button class="btn-outline btn-sm" @click="openEdit(row as ContentPage)">
            {{ canEdit ? t('common.action.edit') : t('pages.admin.open') }}
          </button>
          <template v-if="canEdit">
            <button class="btn-outline btn-sm" :disabled="busyId === (row as ContentPage).id" @click="togglePublish(row as ContentPage)">
              {{ (row as ContentPage).status === 'terbit' ? t('pages.admin.unpublish') : t('pages.admin.publish') }}
            </button>
            <button class="btn-outline btn-sm text-rose-600" :disabled="busyId === (row as ContentPage).id" @click="remove(row as ContentPage)">
              {{ t('common.action.delete') }}
            </button>
          </template>
        </div>
      </template>
    </DataTable>
  </div>
</template>
