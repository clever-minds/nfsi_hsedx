<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull, apiPost, errorMessage } from '@/lib/api';
import { statusLabel } from '@/lib/labels';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import TablePagination from '@/components/ui/TablePagination.vue';

interface Certificate {
  id: string;
  nomor_sertifikat: string | null;
  course_id: string;
  kursus_judul?: string | null;
  status: string;
  tanggal_terbit?: string | null;
}
interface Enrollment {
  id: string;
  course_id: string;
  kursus_judul?: string;
  status: string;
}

const router = useRouter();
const { t } = useI18n();
const auth = useAuthStore();
const certificates = ref<Certificate[]>([]);
const enrollments = ref<Enrollment[]>([]);
const loading = ref(true);
const error = ref('');
const claiming = ref<string | null>(null);
const claimMsg = ref<Record<string, string>>({});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // Keduanya WAJIB difilter ke pengguna yang login — lihat catatan sama di
    // MyCoursesView. Tanpa ini, "Sertifikat Saya" menampilkan sertifikat milik
    // pengguna lain kepada siapa pun yang izinnya luas.
    const uid = auth.user?.id;
    const [cRes, eRes] = await Promise.all([
      apiGetFull<Certificate[]>('/certificates', { limit: 100, 'filter[user_id]': uid }),
      apiGetFull<Enrollment[]>('/enrollments', { limit: 100, 'filter[user_id]': uid }),
    ]);
    certificates.value = cRes.data ?? [];
    enrollments.value = eRes.data ?? [];
    issuedPage.value = 1;
    claimPage.value = 1;
  } catch (e) {
    error.value = errorMessage(e, t('certificates.my.loadFailed'));
  } finally {
    loading.value = false;
  }
}

/**
 * Dipotong di klien: kedua daftar diambil sekali (batas 100 dari BE) lalu
 * disaring — `hasCert` butuh daftar sertifikat **utuh** untuk menandai kursus
 * yang sudah terbit, jadi memaginasi di server akan membuat tanda itu meleset
 * pada halaman kedua dan seterusnya.
 *
 * Ukuran halaman berbeda karena bentuknya berbeda: kartu tersusun 3 kolom
 * (9 = tiga baris penuh), sedangkan daftar klaim satu baris per item.
 */
const ISSUED_PER_PAGE = 9;
const CLAIM_PER_PAGE = 10;
const issuedPage = ref(1);
const claimPage = ref(1);

const issued = computed(() => certificates.value.filter((c) => c.status === 'terbit'));
const issuedShown = computed(() =>
  issued.value.slice((issuedPage.value - 1) * ISSUED_PER_PAGE, issuedPage.value * ISSUED_PER_PAGE),
);
const claimShown = computed(() =>
  enrollments.value.slice((claimPage.value - 1) * CLAIM_PER_PAGE, claimPage.value * CLAIM_PER_PAGE),
);
const hasCert = (courseId: string) => certificates.value.some((c) => c.course_id === courseId && c.status === 'terbit');

async function terbitkan(enr: Enrollment) {
  claiming.value = enr.id;
  claimMsg.value[enr.id] = '';
  try {
    const cert = await apiPost<{ id: string }>(`/enrollments/${enr.id}/certificate/claim`, {});
    router.push(`/d/sertifikat/lihat/${cert.id}`);
  } catch (e) {
    claimMsg.value[enr.id] = errorMessage(e, t('certificates.my.claimFailed'));
  } finally {
    claiming.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('certificates.my.title')" :subtitle="t('certificates.my.subtitle')">
      <template #actions>
        <RouterLink to="/d/sertifikat/badge" class="btn-outline">{{ t('certificates.my.badges') }}</RouterLink>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>
    <div v-else-if="error" class="alert-error">{{ error }}</div>
    <template v-else>
      <h2 class="mb-3 section-title">{{ t('certificates.my.issuedTitle') }}</h2>
      <p v-if="!issued.length" class="empty-state mb-8">{{ t('certificates.my.issuedEmpty') }}</p>
      <template v-else>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="c in issuedShown" :key="c.id" class="card flex flex-col gap-3 p-4">
          <div class="flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-brand-100 to-amber-100 text-3xl text-brand-700">❖</div>
          <div>
            <div class="line-clamp-1 font-medium text-slate-800">{{ c.kursus_judul || t('certificates.my.course') }}</div>
            <div class="num text-xs text-slate-400">{{ c.nomor_sertifikat }}</div>
            <StatusChip status="terbit" />
          </div>
            <RouterLink :to="`/d/sertifikat/lihat/${c.id}`" class="btn-primary mt-auto justify-center">
              {{ t('certificates.my.view') }}
            </RouterLink>
          </div>
        </div>
        <div v-if="issued.length > ISSUED_PER_PAGE" class="card mb-8 mt-4 p-4">
          <TablePagination
            :page="issuedPage"
            :limit="ISSUED_PER_PAGE"
            :total="issued.length"
            @update:page="issuedPage = $event"
          />
        </div>
        <div v-else class="mb-8"></div>
      </template>

      <h2 class="mb-3 section-title">{{ t('certificates.my.claimTitle') }}</h2>
      <p v-if="!enrollments.length" class="empty-state">{{ t('certificates.my.noEnrollments') }}</p>
      <div v-else class="card">
        <div class="divide-y divide-slate-100">
          <div v-for="e in claimShown" :key="e.id" class="flex items-center justify-between gap-3 p-4">
          <div>
            <div class="font-medium text-slate-800">{{ e.kursus_judul || t('certificates.my.course') }}</div>
            <div class="text-xs text-slate-400">{{ t('certificates.my.learningStatus', { status: statusLabel(e.status) }) }}</div>
            <div v-if="claimMsg[e.id]" class="mt-1 text-xs text-amber-600">{{ claimMsg[e.id] }}</div>
          </div>
          <div>
            <span v-if="hasCert(e.course_id)" class="text-sm text-emerald-600">{{ t('certificates.my.alreadyIssued') }}</span>
              <button v-else class="btn-primary" :disabled="claiming === e.id" @click="terbitkan(e)">
                {{ claiming === e.id ? t('certificates.my.processing') : t('certificates.my.issue') }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="enrollments.length > CLAIM_PER_PAGE" class="border-t border-slate-200 p-4">
          <TablePagination
            :page="claimPage"
            :limit="CLAIM_PER_PAGE"
            :total="enrollments.length"
            @update:page="claimPage = $event"
          />
        </div>
      </div>
    </template>
  </div>
</template>
