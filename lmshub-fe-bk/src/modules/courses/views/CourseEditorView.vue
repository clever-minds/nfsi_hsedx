<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusChip from '@/components/ui/StatusChip.vue';

interface CourseDetail {
  id: string;
  judul: string;
  slug: string;
  ringkasan: string | null;
  deskripsi: string | null;
  category_id: string;
  level: string;
  harga: string;
  harga_coret: string | null;
  bahasa: string;
  status_publikasi: string;
  instructor_nama?: string | null;
}
interface Category {
  id: string;
  nama: string;
}

const STATUS_CHAIN = ['draf', 'dalam_review', 'terbit', 'diperbarui', 'diarsip'];

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const courseId = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => !!courseId.value);
const tab = ref<'info' | 'kurikulum'>('info');

const form = reactive({
  judul: '',
  slug: '',
  category_id: '',
  level: 'pemula' as 'pemula' | 'menengah' | 'mahir',
  harga: 0,
  harga_coret: undefined as number | undefined,
  ringkasan: '',
  deskripsi: '',
  bahasa: 'id',
});

const currentStatus = ref('draf');
const instructorNama = ref('');
const categories = ref<Category[]>([]);
const loading = ref(true);
const saving = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');

async function loadCategories() {
  try {
    categories.value = await apiGetFull<Category[]>('/categories', { limit: 100 }).then((r) => r.data ?? []);
  } catch {
    categories.value = [];
  }
}

async function loadCourse(id: string) {
  const c = await apiGet<CourseDetail>(`/courses/${id}`);
  form.judul = c.judul;
  form.slug = c.slug;
  form.category_id = c.category_id;
  form.level = c.level as typeof form.level;
  form.harga = Number(c.harga);
  form.harga_coret = c.harga_coret ? Number(c.harga_coret) : undefined;
  form.ringkasan = c.ringkasan ?? '';
  form.deskripsi = c.deskripsi ?? '';
  form.bahasa = c.bahasa;
  currentStatus.value = c.status_publikasi;
  instructorNama.value = c.instructor_nama ?? '';
}

onMounted(async () => {
  loading.value = true;
  error.value = '';
  try {
    await loadCategories();
    if (courseId.value) await loadCourse(courseId.value);
    else if (categories.value.length) form.category_id = categories.value[0].id;
  } catch (e) {
    error.value = errorMessage(e, t('courses.editor.loadFailed'));
  } finally {
    loading.value = false;
  }
});

async function submit() {
  error.value = '';
  saving.value = true;
  try {
    const payload = {
      judul: form.judul,
      slug: form.slug || undefined,
      category_id: form.category_id,
      level: form.level,
      harga: Number(form.harga),
      harga_coret: form.harga_coret ? Number(form.harga_coret) : undefined,
      ringkasan: form.ringkasan || undefined,
      deskripsi: form.deskripsi || undefined,
      bahasa: form.bahasa,
    };
    if (isEdit.value && courseId.value) {
      await apiPut(`/courses/${courseId.value}`, payload);
      notice.value = t('courses.editor.saved');
    } else {
      const created = await apiPost<{ id: string }>('/courses', payload);
      router.push(`/d/kursus/${created.id}`);
      return;
    }
  } catch (e) {
    error.value = errorMessage(e, t('courses.editor.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function transition(action: 'submit' | 'publish' | 'archive') {
  if (!courseId.value) return;
  busy.value = true;
  error.value = '';
  try {
    await apiPost(`/courses/${courseId.value}/${action}`, {});
    await loadCourse(courseId.value);
  } catch (e) {
    error.value = errorMessage(e, t('courses.editor.statusFailed'));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader
      :title="isEdit ? form.judul || t('courses.editor.titleEdit') : t('courses.editor.titleNew')"
      :subtitle="t('courses.editor.subtitle')"
    >
      <template #actions>
        <StatusChip v-if="isEdit" :status="currentStatus" />
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <template v-else>
      <div v-if="isEdit" class="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <template v-for="(s, i) in STATUS_CHAIN" :key="s">
          <span :class="s === currentStatus ? 'font-semibold text-brand-700' : ''">{{ t(`courses.status.${s}`) }}</span>
          <span v-if="i < STATUS_CHAIN.length - 1">──</span>
        </template>
      </div>

      <div v-if="isEdit" class="tab-bar mb-4">
        <button
          class="tab-item"
          :class="{ 'tab-item-active': tab === 'info' }"
          @click="tab = 'info'"
        >
          {{ t('courses.editor.tabInfo') }}
        </button>
        <button
          class="tab-item"
          :class="{ 'tab-item-active': tab === 'kurikulum' }"
          @click="tab = 'kurikulum'"
        >
          {{ t('courses.editor.tabCurriculum') }}
        </button>
      </div>

      <p v-if="error" class="mb-4 alert-error">{{ error }}</p>
      <p v-if="notice" class="mb-4 alert-success">{{ notice }}</p>

      <div v-if="tab === 'info'" class="space-y-6">
        <form class="card grid gap-4 p-5 sm:grid-cols-2" @submit.prevent="submit">
          <div class="sm:col-span-2">
            <label class="label">{{ t('courses.editor.fieldTitle') }}</label>
            <input v-model="form.judul" class="input" required :placeholder="t('courses.editor.fieldTitlePlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldSlug') }}</label>
            <input v-model="form.slug" class="input" :placeholder="t('courses.editor.fieldSlugPlaceholder')" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldCategory') }}</label>
            <select v-model="form.category_id" class="input" required>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.nama }}</option>
            </select>
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldLevel') }}</label>
            <select v-model="form.level" class="input">
              <option value="pemula">{{ t('common.level.pemula') }}</option>
              <option value="menengah">{{ t('common.level.menengah') }}</option>
              <option value="mahir">{{ t('common.level.mahir') }}</option>
            </select>
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldLanguage') }}</label>
            <input v-model="form.bahasa" class="input" maxlength="10" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldPrice') }}</label>
            <input v-model.number="form.harga" class="input" type="number" min="0" />
          </div>
          <div>
            <label class="label">{{ t('courses.editor.fieldStrikePrice') }}</label>
            <input v-model.number="form.harga_coret" class="input" type="number" min="0" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('courses.editor.fieldSummary') }}</label>
            <textarea v-model="form.ringkasan" class="input" rows="2" maxlength="500"></textarea>
          </div>
          <div class="sm:col-span-2">
            <label class="label">{{ t('courses.editor.fieldDescription') }}</label>
            <textarea v-model="form.deskripsi" class="input" rows="5"></textarea>
          </div>
          <div v-if="isEdit" class="text-xs text-slate-400 sm:col-span-2">
            {{ t('courses.editor.instructor', { name: instructorNama || '—' }) }}
          </div>

          <div class="flex flex-wrap gap-2 sm:col-span-2">
            <button class="btn-primary" type="submit" :disabled="saving">
              {{ saving ? t('common.state.saving') : t('common.action.save') }}
            </button>
            <RouterLink to="/d/kursus" class="btn-outline">{{ t('common.action.cancel') }}</RouterLink>
          </div>
        </form>

        <div v-if="isEdit" class="card flex flex-wrap gap-2 p-5">
          <button
            v-if="currentStatus === 'draf'"
            v-can="'kursus.update'"
            class="btn-outline"
            :disabled="busy"
            @click="transition('submit')"
          >
            {{ t('courses.list.submitReview') }}
          </button>
          <button
            v-if="['dalam_review', 'diperbarui'].includes(currentStatus)"
            v-can="'kursus.update'"
            class="btn-outline"
            :disabled="busy"
            @click="transition('publish')"
          >
            {{ t('courses.editor.approvePublish') }}
          </button>
          <button
            v-if="currentStatus !== 'diarsip'"
            v-can="'kursus.update'"
            class="btn-outline"
            :disabled="busy"
            @click="transition('archive')"
          >
            {{ t('courses.list.archive') }}
          </button>
        </div>
      </div>

      <div v-else-if="isEdit && courseId" class="card space-y-3 p-5">
        <p class="text-sm text-slate-500">{{ t('courses.editor.curriculumHint') }}</p>
        <div class="flex flex-wrap gap-2">
          <RouterLink :to="`/d/konten?courseId=${courseId}`" class="btn-primary">{{ t('courses.editor.openBuilder') }}</RouterLink>
          <RouterLink :to="`/d/konten/media?courseId=${courseId}`" class="btn-outline">{{ t('courses.editor.openMedia') }}</RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>
