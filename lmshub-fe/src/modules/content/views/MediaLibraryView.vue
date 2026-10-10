<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPatch, apiPost, errorMessage } from '@/lib/api';
import { fmtAngka } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import MediaUploadButton from '@/modules/content/components/MediaUploadButton.vue';

type TipeFile = 'video' | 'image' | 'document' | 'audio';
type StatusTranscode = 'pending' | 'memproses' | 'completed' | 'failed';

interface MediaAsset extends Record<string, unknown> {
  id: string;
  file_type: TipeFile;
  file_name: string;
  path_object_storage: string;
  mime_type: string | null;
  size_bytes: number | null;
  status_transcode: StatusTranscode;
  duration_seconds: number | null;
  created_at: string;
}

const { t } = useI18n();

const TIPE_OPTIONS: TipeFile[] = ['video', 'image', 'document', 'audio'];
const STATUS_OPTIONS: StatusTranscode[] = ['pending', 'memproses', 'completed', 'failed'];

const tipeLabel = (type: TipeFile) => t(`content.mediaType.${type}`);
const transcodeLabel = (s: StatusTranscode) => t(`content.transcode.${s}`);

const rows = ref<MediaAsset[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 24;

const q = ref('');
const tipeFilter = ref('');
const statusFilter = ref('');

const loading = ref(true);
const error = ref('');
const busyId = ref<string | null>(null);
const notice = ref('');
const showForm = ref(false);
const saving = ref(false);

const form = reactive({
  file_type: 'video' as TipeFile,
  file_name: '',
  path_object_storage: '',
});

const columns = computed(() => [
  { key: 'file_name', label: t('content.media.colName') },
  { key: 'file_type', label: t('content.media.colType') },
  { key: 'size_bytes', label: t('content.media.colSize') },
  { key: 'status_transcode', label: t('content.media.colStatus') },
]);

function formatSize(bytes: number | null): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<MediaAsset[]>('/media', {
      page: page.value,
      limit,
      q: q.value || undefined,
      'filter[file_type]': tipeFilter.value || undefined,
      'filter[status_transcode]': statusFilter.value || undefined,
    });
    rows.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? rows.value.length;
  } catch (e) {
    error.value = errorMessage(e, t('content.media.loadFailed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

async function createAsset() {
  if (!form.file_name.trim() || !form.path_object_storage.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    await apiPost('/media', {
      file_type: form.file_type,
      file_name: form.file_name.trim(),
      path_object_storage: form.path_object_storage.trim(),
    });
    form.file_name = '';
    form.path_object_storage = '';
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('content.media.createFailed'));
  } finally {
    saving.value = false;
  }
}

async function setStatus(id: string, status: StatusTranscode) {
  busyId.value = id;
  try {
    await apiPatch(`/media/${id}/status`, { status_transcode: status });
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('content.media.statusFailed'));
  } finally {
    busyId.value = null;
  }
}

async function removeAsset(id: string) {
  busyId.value = id;
  try {
    await apiDelete(`/media/${id}`);
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('content.media.deleteFailed'));
  } finally {
    busyId.value = null;
  }
}

async function onUploaded(asset: { file_name: string }) {
  notice.value = t('content.media.uploaded', { name: asset.file_name });
  page.value = 1;
  await load();
}

watch(page, load);
onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('content.media.title')" :subtitle="t('content.media.subtitle')">
      <template #actions>
        <div v-can="'content.create'" class="flex flex-wrap items-start gap-2">
          <MediaUploadButton @uploaded="onUploaded" />
          <button class="btn-outline" @click="showForm = !showForm">
            {{ showForm ? t('common.action.cancel') : t('content.media.add') }}
          </button>
        </div>
      </template>
    </PageHeader>

    <div v-if="showForm" v-can="'content.create'" class="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
      <div>
        <label class="label">{{ t('content.media.fieldType') }}</label>
        <select v-model="form.file_type" class="input">
          <option v-for="tf in TIPE_OPTIONS" :key="tf" :value="tf">{{ tipeLabel(tf) }}</option>
        </select>
      </div>
      <div>
        <label class="label">{{ t('content.media.fieldName') }}</label>
        <input v-model="form.file_name" class="input" :placeholder="t('content.media.fieldNamePlaceholder')" />
      </div>
      <div>
        <label class="label">{{ t('content.media.fieldPath') }}</label>
        <input v-model="form.path_object_storage" class="input" :placeholder="t('content.media.fieldPathPlaceholder')" />
      </div>
      <div class="sm:col-span-3">
        <button class="btn-primary" :disabled="saving" @click="createAsset">
          {{ saving ? t('common.state.saving') : t('content.media.saveAsset') }}
        </button>
      </div>
    </div>

    <p class="mb-4 text-sm text-slate-500">{{ t('content.media.uploadHint') }}</p>
    <p v-if="notice" class="mb-4 text-sm text-emerald-600">{{ notice }}</p>
    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <DataTable :columns="columns" :rows="rows" :loading="loading" :empty="t('content.media.empty')">
      <template #toolbar>
        <input v-model="q" class="input max-w-xs" :placeholder="t('content.media.searchPlaceholder')" @keyup.enter="search" />
        <select v-model="tipeFilter" class="input w-auto" @change="search">
          <option value="">{{ t('content.media.allTypes') }}</option>
          <option v-for="tf in TIPE_OPTIONS" :key="tf" :value="tf">{{ tipeLabel(tf) }}</option>
        </select>
        <select v-model="statusFilter" class="input w-auto" @change="search">
          <option value="">{{ t('content.media.allStatus') }}</option>
          <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ transcodeLabel(s) }}</option>
        </select>
        <button class="btn-outline" @click="search">{{ t('common.action.search') }}</button>
      </template>
      <template #cell:file_type="{ value }">{{ tipeLabel(value as TipeFile) }}</template>
      <template #cell:size_bytes="{ value }">{{ formatSize(value as number | null) }}</template>
      <template #cell:status_transcode="{ row }">
        <div class="flex items-center gap-2">
          <StatusChip :status="String((row as unknown as MediaAsset).status_transcode)" />
          <select
            v-can="'content.update'"
            class="input w-auto py-0.5 text-xs"
            :value="(row as unknown as MediaAsset).status_transcode"
            :disabled="busyId === (row as unknown as MediaAsset).id"
            @change="setStatus((row as unknown as MediaAsset).id, ($event.target as HTMLSelectElement).value as StatusTranscode)"
          >
            <option v-for="s in STATUS_OPTIONS" :key="s" :value="s">{{ transcodeLabel(s) }}</option>
          </select>
        </div>
      </template>
      <template #actions="{ row }">
        <button
          v-can="'content.delete'"
          class="row-link row-link-danger"
          :disabled="busyId === (row as unknown as MediaAsset).id"
          @click="removeAsset((row as unknown as MediaAsset).id)"
        >
          {{ t('common.action.delete') }}
        </button>
      </template>
      <template #footer>
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event" />
      </template>
    </DataTable>

    <p class="mt-2 text-xs text-slate-400">{{ t('content.media.totalAssets', { n: fmtAngka(total) }) }}</p>
  </div>
</template>
