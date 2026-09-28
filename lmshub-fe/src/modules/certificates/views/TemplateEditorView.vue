<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';

interface CertificateTemplate extends Record<string, unknown> {
  id: string;
  nama: string;
  kategori?: string;
  logo_url?: string;
  teks_penandatangan?: string;
  aktif?: boolean;
}

const { t } = useI18n();

const templates = ref<CertificateTemplate[]>([]);
const loading = ref(true);
const page = ref(1);
const limit = 20;
const total = ref(0);
const error = ref('');
const saving = ref(false);
const editingId = ref<string | null>(null);

const form = reactive({
  nama: '',
  kategori: '',
  logo_url: '',
  teks_penandatangan: '',
});

const columns = computed(() => [
  { key: 'nama', label: t('certificates.template.colName') },
  { key: 'kategori_nama', label: t('certificates.template.colCategory') },
  { key: 'aktif', label: t('certificates.template.colStatus') },
]);

/** Token placeholder ditulis literal agar tidak diinterpolasi vue-i18n. */
const PLACEHOLDER_TOKENS = '{{nama}}, {{nomor}}, {{tanggal}}';

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // BE: GET /certificate-templates (bukan /certificates/templates)
    const res = await apiGetFull<CertificateTemplate[]>('/certificate-templates');
    templates.value = res.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('certificates.template.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  form.nama = '';
  form.kategori = '';
  form.logo_url = '';
  form.teks_penandatangan = '';
}

function editTemplate(t: CertificateTemplate) {
  editingId.value = t.id;
  form.nama = t.nama;
  form.kategori = t.kategori || '';
  form.logo_url = t.logo_url || '';
  form.teks_penandatangan = t.teks_penandatangan || '';
}

async function save() {
  if (!form.nama.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    if (editingId.value) {
      // BE: PUT /certificate-templates/:id (bukan PATCH /certificates/templates/:id)
      await apiPut(`/certificate-templates/${editingId.value}`, { ...form });
    } else {
      await apiPost('/certificate-templates', { ...form });
    }
    resetForm();
    await load();
  } catch (e) {
    error.value = errorMessage(e, t('certificates.template.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('certificates.template.title')" :subtitle="t('certificates.template.subtitle')" />

    <p v-if="error" class="mb-4 alert-error">{{ error }}</p>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <DataTable :columns="columns" :rows="templates" :loading="loading" :empty="t('certificates.template.empty')">
          <template #cell:aktif="{ value }">
            <span :class="value ? 'text-emerald-600' : 'text-slate-400'">
              {{ value ? t('certificates.template.active') : t('certificates.template.inactive') }}
            </span>
          </template>
          <template #actions="{ row }">
            <button v-can="'sertifikat.update'" class="btn-outline text-xs" @click="editTemplate(row as CertificateTemplate)">
              {{ t('certificates.template.edit') }}
            </button>
          </template>
          <template #footer>
            <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
          </template>
        </DataTable>
      </div>

      <div v-can="'sertifikat.update'" class="card h-fit p-4">
        <h3 class="mb-3 font-medium text-slate-800">
          {{ editingId ? t('certificates.template.formTitleEdit') : t('certificates.template.formTitleNew') }}
        </h3>
        <div class="space-y-3">
          <div>
            <label class="label">{{ t('certificates.template.name') }}</label>
            <input v-model="form.nama" class="input" :placeholder="t('certificates.template.namePlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('certificates.template.category') }}</label>
            <input v-model="form.kategori" class="input" :placeholder="t('certificates.template.categoryPlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('certificates.template.logoUrl') }}</label>
            <input v-model="form.logo_url" class="input" placeholder="https://…" />
          </div>
          <div>
            <label class="label">{{ t('certificates.template.signatureText') }}</label>
            <textarea
              v-model="form.teks_penandatangan"
              class="input"
              rows="2"
              :placeholder="t('certificates.template.signaturePlaceholder')"
            ></textarea>
          </div>

          <div class="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-400">
            {{ t('certificates.template.placeholderHint', { tokens: PLACEHOLDER_TOKENS }) }}
          </div>

          <div class="flex gap-2">
            <button class="btn-primary flex-1" :disabled="saving" @click="save">
              {{
                saving
                  ? t('common.state.saving')
                  : editingId
                    ? t('certificates.template.save')
                    : t('certificates.template.create')
              }}
            </button>
            <button v-if="editingId" class="btn-outline" @click="resetForm">{{ t('common.action.cancel') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
