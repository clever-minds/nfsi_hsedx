<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, errorMessage } from '@/lib/api';
import { fmtPersen } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import TablePagination from '@/components/ui/TablePagination.vue';

const { t } = useI18n();
const auth = useAuthStore();

interface EnrollmentRow {
  id: string;
  course_id: string;
  kursus_judul: string;
  status: string;
}
interface EnrolledCourse {
  id: string;
  course_id: string;
  judul: string;
  progress_percent: number;
  status: string;
}

const AKTIF = ['terdaftar', 'aktif', 'selesai'];

/** Seluruh enrollment yang sudah tersaring status — sumber hitungan halaman. */
const enrolled = ref<EnrollmentRow[]>([]);
/** Hanya kursus pada halaman aktif, lengkap dengan persen progres. */
const courses = ref<EnrolledCourse[]>([]);
const loading = ref(true);
const pageLoading = ref(false);
const error = ref('');

const page = ref(1);
const limit = 12; // habis dibagi 4 → tiga baris penuh di layar lebar
const total = computed(() => enrolled.value.length);

/**
 * Paginasi dikerjakan di klien, bukan lewat `page`/`limit` ke BE. Alasannya:
 * halaman ini hanya menampilkan enrollment berstatus aktif, sedangkan BE cuma
 * menerima satu nilai status (`e.status = $?`), tidak bisa tiga sekaligus.
 * Kalau dipaginasi di server, `meta.total` ikut menghitung enrollment batal dan
 * kedaluwarsa — jumlah halamannya jadi salah dan sebagian halaman tampil
 * setengah kosong.
 *
 * Batas 100 adalah maksimum BE; seorang siswa dengan lebih dari 100 enrollment
 * perlu dukungan filter status jamak di BE sebelum bisa ditangani utuh.
 */
async function load() {
  loading.value = true;
  error.value = '';
  try {
    // WAJIB memfilter ke pengguna yang login. BE hanya membatasi /enrollments
    // ke milik sendiri untuk peran siswa; peran dengan `enrollment.view` luas
    // (admin, direktur, instruktur, …) menerima enrollment SELURUH pengguna —
    // halaman ini lalu menampilkannya seolah miliknya, dan tombol Mulai
    // Belajar berujung "Anda belum terdaftar di kursus ini".
    const res = await apiGetFull<EnrollmentRow[]>('/enrollments', {
      limit: 100,
      'filter[user_id]': auth.user?.id,
    });
    enrolled.value = (res.data ?? []).filter((e) => AKTIF.includes(e.status));
    page.value = 1;
    await loadPage();
  } catch (e) {
    error.value = errorMessage(e, t('learn.my.loadFailed'));
    enrolled.value = [];
    courses.value = [];
  } finally {
    loading.value = false;
  }
}

/**
 * Persen progres diambil per kursus karena daftar enrollment BE tidak
 * menyertakannya — jadi hanya kursus yang benar-benar tampil yang diminta.
 * Hanya kursus pada halaman aktif yang diminta; meminta seluruh daftar berarti
 * seratus permintaan paralel untuk siswa dengan banyak kursus.
 */
async function loadPage() {
  pageLoading.value = true;
  const slice = enrolled.value.slice((page.value - 1) * limit, page.value * limit);
  courses.value = await Promise.all(
    slice.map(async (e) => {
      const persen = await apiGet<{ persen_selesai: string }>(`/courses/${e.course_id}/progress`)
        .then((p) => Number(p.persen_selesai))
        .catch(() => 0);
      return { id: e.id, course_id: e.course_id, judul: e.kursus_judul, status: e.status, progress_percent: persen };
    }),
  );
  pageLoading.value = false;
}

watch(page, loadPage);
onMounted(load);
</script>

<template>
  <div>
    <PageHeader :title="t('learn.my.title')" :subtitle="t('learn.my.subtitle')" />

    <div v-if="loading || pageLoading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <div v-for="i in limit" :key="i" class="card h-64 animate-pulse bg-slate-100"></div>
    </div>

    <div v-else-if="error" class="alert-error">{{ error }}</div>

    <div v-else-if="!courses.length" class="empty-state">
      {{ t('learn.my.empty') }}
      <RouterLink to="/d/katalog" class="mt-2 block font-medium text-brand-700">{{ t('learn.my.browseCatalog') }}</RouterLink>
    </div>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div v-for="c in courses" :key="c.id" class="card flex flex-col p-4">
          <div class="h-28 rounded-lg bg-brand-100"></div>
          <h3 class="mt-3 line-clamp-2 card-title">{{ c.judul }}</h3>

          <div class="mt-3">
            <div class="flex items-center justify-between text-xs text-slate-500">
              <span>{{ t('learn.my.progress') }}</span>
              <span class="num">{{ fmtPersen(c.progress_percent ?? 0) }}</span>
            </div>
            <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full bg-brand-600"
                :style="{ width: `${Math.min(100, Math.max(0, c.progress_percent ?? 0))}%` }"
              ></div>
            </div>
          </div>

          <div class="mt-4 flex-1"></div>

          <!-- 100%: tetap bisa buka course (review materi) + lihat sertifikat berdampingan -->
          <div v-if="(c.progress_percent ?? 0) >= 100" class="mt-2 flex gap-2">
            <RouterLink :to="`/d/belajar/${c.course_id}`" class="btn-outline flex-1 justify-center">
              {{ t('learn.my.viewCourse') }}
            </RouterLink>
            <RouterLink to="/d/sertifikat" class="btn-primary flex-1 justify-center bg-accent-500 hover:bg-accent-600">
              {{ t('learn.my.certificate') }}
            </RouterLink>
          </div>
          <RouterLink v-else :to="`/d/belajar/${c.course_id}`" class="btn-primary mt-2 w-full justify-center">
            {{ (c.progress_percent ?? 0) > 0 ? t('learn.my.continue') : t('learn.my.start') }}
          </RouterLink>
        </div>
      </div>

      <div v-if="total > limit" class="card mt-4 p-4">
        <TablePagination :page="page" :limit="limit" :total="total" @update:page="page = $event" />
      </div>
    </template>
  </div>
</template>
