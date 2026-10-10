<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import TablePagination from '@/components/ui/TablePagination.vue';
import RichTextEditor from '@/components/ui/RichTextEditor.vue';

interface CertificateTemplate extends Record<string, unknown> {
  id: string;
  name: string;
  category?: string;
  category_id?: string;
  category_name?: string;
  logo_url?: string;
  teks_penandatangan?: string;
  content?: string;
  active?: boolean;
  is_active?: boolean;
  layout?: {
    content?: string;
    [key: string]: any;
  };
}

interface Category {
  id: string;
  name: string;
}

const { t } = useI18n();

const templates = ref<CertificateTemplate[]>([]);
const categories = ref<Category[]>([]);
const loading = ref(true);
const page = ref(1);
const limit = 20;
const total = ref(0);
const error = ref('');
const saving = ref(false);
const editingId = ref<string | null>(null);

const form = reactive({
  name: '',
  category_id: '',
  content: '',
  is_active: true,
});

const columns = computed(() => [
  { key: 'name', label: t('certificates.template.colName') },
  { key: 'category_name', label: t('certificates.template.colCategory') },
  { key: 'is_active', label: t('certificates.template.colStatus') },
]);

/**
 * Placeholder tokens, written literally so vue-i18n does not interpolate them.
 * The tokens themselves are fixed (saved templates use them); each is followed
 * by its meaning in the reader's language.
 */
const PLACEHOLDER_TOKENS = computed(() =>
  (['name', 'number', 'date'] as const)
    .map((k) => `{{${k}}} (${t(`certificates.template.token.${k}`)})`)
    .join(', '),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [resTemplates, resCategories] = await Promise.all([
      apiGetFull<CertificateTemplate[]>('/certificate-templates'),
      apiGetFull<Category[]>('/categories', { limit: 100 })
    ]);
    templates.value = resTemplates.data ?? [];
    categories.value = resCategories.data ?? [];
  } catch (e) {
    error.value = errorMessage(e, t('certificates.template.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  editingId.value = null;
  form.name = '';
  form.category_id = '';
  form.content = '';
  form.is_active = true;
}

function editTemplate(t: CertificateTemplate) {
  editingId.value = t.id;
  form.name = t.name;
  form.category_id = t.category_id || '';
  form.content = t.layout?.content || t.content || '';
  form.is_active = t.is_active ?? t.active ?? true;
}

async function save() {
  if (!form.name.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      name: form.name,
      category_id: form.category_id,
      is_active: form.is_active,
      layout: { content: form.content }
    };
    
    if (editingId.value) {
      await apiPut(`/certificate-templates/${editingId.value}`, payload);
    } else {
      await apiPost('/certificate-templates', payload);
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
          <template #cell:is_active="{ value }">
            <span :class="value ? 'text-emerald-600' : 'text-slate-400'">
              {{ value ? t('certificates.template.active') : t('certificates.template.inactive') }}
            </span>
          </template>
          <template #actions="{ row }">
            <button v-can="'certificate.update'" class="btn-outline text-xs" @click="editTemplate(row as CertificateTemplate)">
              {{ t('certificates.template.edit') }}
            </button>
          </template>
          <template #footer>
            <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event; load()" />
          </template>
        </DataTable>
      </div>

      <div v-can="'certificate.update'" class="card h-fit p-4">
        <h3 class="mb-3 font-medium text-slate-800">
          {{ editingId ? t('certificates.template.formTitleEdit') : t('certificates.template.formTitleNew') }}
        </h3>
        <div class="space-y-3">
          <div>
            <label class="label">{{ t('certificates.template.name') }}</label>
            <input v-model="form.name" class="input" :placeholder="t('certificates.template.namePlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('certificates.template.category') }}</label>
            <select v-model="form.category_id" class="input">
              <option value="">-- Select Category --</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label class="label">Status</label>
            <select v-model="form.is_active" class="input">
              <option :value="true">{{ t('certificates.template.active') }}</option>
              <option :value="false">{{ t('certificates.template.inactive') }}</option>
            </select>
          </div>
          <div>
            <label class="label">Content</label>
            <RichTextEditor v-model="form.content" />
          </div>

          <div class="mt-4">
            <h4 class="mb-2 text-sm font-medium text-orange-400">Shortcodes</h4>
            <div class="overflow-hidden rounded-lg border border-slate-200 text-sm">
              <table class="w-full text-left">
                <thead class="bg-slate-50 text-slate-700">
                  <tr>
                    <th class="px-4 py-3 font-medium">Code</th>
                    <th class="px-4 py-3 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-slate-600">
                  <tr class="bg-slate-50/50">
                    <td class="px-4 py-3 font-mono">{name}</td>
                    <td class="px-4 py-3">Student Name</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-3 font-mono">{duration}</td>
                    <td class="px-4 py-3">Course Duration</td>
                  </tr>
                  <tr class="bg-slate-50/50">
                    <td class="px-4 py-3 font-mono">{title}</td>
                    <td class="px-4 py-3">Course Title</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-3 font-mono">{date}</td>
                    <td class="px-4 py-3">Course Completion Date</td>
                  </tr>
                  <tr class="bg-slate-50/50">
                    <td class="px-4 py-3 font-mono">{number}</td>
                    <td class="px-4 py-3">Certificate Number</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-xs text-orange-400">
              You can use these short codes to show dynamic data in certificate text.
            </p>
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
