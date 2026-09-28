<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, assetUrl, errorMessage } from '@/lib/api';
import { fmtAngka, fmtRelatif, initialsOf } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import StarRating from '@/components/ui/StarRating.vue';

const props = defineProps<{ courseId: string }>();
const auth = useAuthStore();
const { t } = useI18n();

interface Review {
  id: string;
  rating: number;
  ulasan: string | null;
  user_nama: string;
  user_foto: string | null;
  created_at: string;
}
interface Summary {
  rating_avg: number;
  rating_count: number;
  distribusi: Record<'1' | '2' | '3' | '4' | '5', number>;
}
interface MyReviewState {
  eligible: boolean;
  alasan: string | null;
  enrollment_status: string | null;
  review: { id: string; rating: number; ulasan: string | null } | null;
}

const summary = ref<Summary>({ rating_avg: 0, rating_count: 0, distribusi: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } });
const reviews = ref<Review[]>([]);
const loading = ref(true);
const my = ref<MyReviewState | null>(null);

// Form
const showForm = ref(false);
const formRating = ref(5);
const formUlasan = ref('');
const saving = ref(false);
const formError = ref('');

const barPct = (star: 1 | 2 | 3 | 4 | 5) =>
  summary.value.rating_count ? (summary.value.distribusi[String(star) as `${typeof star}`] / summary.value.rating_count) * 100 : 0;

async function loadPublic() {
  const res = await apiGet<{ summary: Summary; reviews: Review[] }>(`/courses/${props.courseId}/reviews`);
  summary.value = res.summary;
  reviews.value = res.reviews;
}

async function loadMine() {
  if (!auth.isAuthenticated) return;
  my.value = await apiGet<MyReviewState>(`/courses/${props.courseId}/reviews/me`).catch(() => null);
  if (my.value?.review) {
    formRating.value = my.value.review.rating;
    formUlasan.value = my.value.review.ulasan ?? '';
  }
}

async function submit() {
  saving.value = true;
  formError.value = '';
  try {
    await apiPost(`/courses/${props.courseId}/reviews`, { rating: formRating.value, ulasan: formUlasan.value.trim() || null });
    showForm.value = false;
    await Promise.all([loadPublic(), loadMine()]);
  } catch (e) {
    formError.value = errorMessage(e, t('catalog.reviews.saveFailed'));
  } finally {
    saving.value = false;
  }
}

const ctaLabel = computed(() => (my.value?.review ? t('catalog.reviews.edit') : t('catalog.reviews.write')));

onMounted(async () => {
  try {
    await Promise.all([loadPublic(), loadMine()]);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <h2 class="section-title">{{ t('catalog.reviews.title') }}</h2>
      <button
        v-if="my?.eligible"
        class="btn-outline py-1.5 text-sm"
        @click="showForm = !showForm"
      >
        {{ showForm ? t('catalog.reviews.close') : ctaLabel }}
      </button>
    </div>

    <div v-if="loading" class="card h-32 animate-pulse bg-slate-100"></div>

    <template v-else>
      <!-- Form beri/ubah ulasan -->
      <div v-if="showForm" class="card mb-5 p-5">
        <label class="label">{{ t('catalog.reviews.yourRating') }}</label>
        <StarRating v-model="formRating" :size="30" editable />
        <label class="label mt-4">{{ t('catalog.reviews.reviewOptional') }}</label>
        <textarea v-model="formUlasan" rows="3" class="input" :placeholder="t('catalog.reviews.placeholder')"></textarea>
        <div v-if="formError" class="mt-2 text-sm text-rose-600">{{ formError }}</div>
        <div class="mt-4 flex gap-2">
          <button class="btn-primary" :disabled="saving" @click="submit">
            {{ saving ? t('common.state.saving') : t('catalog.reviews.submit') }}
          </button>
          <button class="btn-outline" @click="showForm = false">{{ t('common.action.cancel') }}</button>
        </div>
      </div>

      <!-- Ringkasan -->
      <div class="card mb-5 grid gap-6 p-6 sm:grid-cols-[auto,1fr]">
        <div class="flex flex-col items-center justify-center border-slate-100 pe-6 sm:border-e">
          <div class="num text-5xl font-black text-slate-900">{{ summary.rating_avg.toFixed(1) }}</div>
          <StarRating :model-value="summary.rating_avg" :size="18" class="mt-1" />
          <div class="mt-1 text-xs text-slate-400">{{ t('catalog.reviews.count', { n: fmtAngka(summary.rating_count) }) }}</div>
        </div>
        <div class="flex flex-col justify-center gap-1.5">
          <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="flex items-center gap-2 text-xs text-slate-500">
            <span class="num w-3 text-end">{{ star }}</span>
            <span class="text-accent-500">★</span>
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-accent-500" :style="{ width: `${barPct(star as 1|2|3|4|5)}%` }"></div>
            </div>
            <span class="num w-6 text-end text-slate-400">{{ summary.distribusi[String(star) as '1'|'2'|'3'|'4'|'5'] }}</span>
          </div>
        </div>
      </div>

      <!-- Hint kelayakan -->
      <p v-if="my && !my.eligible && !reviews.length" class="mb-3 text-sm text-slate-400">
        {{ t('catalog.reviews.eligibleHint') }}
      </p>

      <!-- Daftar ulasan -->
      <div v-if="reviews.length" class="space-y-3">
        <div v-for="r in reviews" :key="r.id" class="card p-4">
          <div class="flex items-start gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500 text-sm font-bold text-white">
              <img v-if="r.user_foto" :src="assetUrl(r.user_foto)" :alt="r.user_nama" class="h-full w-full object-cover" />
              <template v-else>{{ initialsOf(r.user_nama) }}</template>
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center justify-between gap-1">
                <span class="font-medium text-slate-900">{{ r.user_nama }}</span>
                <span class="text-xs text-slate-400">{{ fmtRelatif(r.created_at) }}</span>
              </div>
              <StarRating :model-value="r.rating" :size="14" class="mt-0.5" />
              <p v-if="r.ulasan" class="mt-2 text-sm leading-relaxed text-slate-700">{{ r.ulasan }}</p>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="card p-6 text-center text-sm text-slate-400">{{ t('catalog.reviews.empty') }}</p>
    </template>
  </div>
</template>
