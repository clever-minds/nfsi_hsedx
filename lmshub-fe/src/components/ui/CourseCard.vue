<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmtAngka, fmtHarga } from '@/lib/format';
import { assetUrl } from '@/lib/api';
import { levelLabel } from '@/lib/labels';
import Icon from '@/components/ui/Icon.vue';

const { t } = useI18n();

/** Kartu course ala DreamsLMS — dipakai landing, catalog, dan detail instructor. */
const props = defineProps<{
  course: {
    slug: string;
    title: string;
    price: number | string;
    strike_price?: number | string | null;
    level?: string;
    category_name?: string | null;
    instructor_name?: string | null;
    instructor_foto?: string | null;
    rating_avg?: string | number | null;
    rating_count?: number | null;
    student_count?: number | null;
    total_duration_minutes?: number | null;
    meta?: { thumbnail_url?: string } | null;
  };
  /** Basis tautan detail ('/courses' publik, '/d/catalog' dashboard). */
  base?: string;
}>();

const to = computed(() => `${props.base ?? '/courses'}/${props.course.slug}`);
const inisial = computed(() =>
  (props.course.instructor_name ?? '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
);
const discount = computed(() => {
  const h = Number(props.course.price);
  const c = Number(props.course.strike_price ?? 0);
  return c > h && h > 0 ? Math.round(((c - h) / c) * 100) : 0;
});

// DEBUG LOG: See what the thumbnail URL is
console.log(`Course [${props.course.title}] thumbnail URL:`, props.course.meta?.thumbnail_url);
</script>

<template>
  <RouterLink :to="to" class="card group flex flex-col overflow-hidden rounded-xl transition hover:-translate-y-1 hover:shadow-lg">
    <!-- Thumbnail -->
    <div class="relative h-44 overflow-hidden">
      <img
        v-if="course.meta?.thumbnail_url"
        :src="assetUrl(course.meta.thumbnail_url)"
        :alt="course.title"
        loading="lazy"
        class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      />
      <div v-else class="grid h-full place-items-center bg-gradient-to-br from-brand-400 to-brand-600 text-white/80">
        <Icon name="play-circle" :size="40" />
      </div>
      <span v-if="discount" class="absolute start-3 top-3 rounded-md bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white">
        {{ t('catalog.card.discount', { n: discount }) }}
      </span>
      <span v-if="course.level" class="absolute end-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
        {{ levelLabel(course.level) }}
      </span>
    </div>

    <!-- Isi -->
    <div class="flex flex-1 flex-col p-4">
      <div class="flex items-center gap-2">
        <span v-if="course.category_name" class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {{ course.category_name }}
        </span>
      </div>

      <h3 class="mt-2.5 line-clamp-2 font-semibold leading-snug text-slate-900 group-hover:text-brand-500">
        {{ course.title }}
      </h3>

      <div class="mt-2 flex items-center gap-1 text-xs">
        <Icon name="star" :size="13" class="fill-accent-400 text-accent-400" />
        <span class="num font-semibold text-slate-700">{{ Number(course.rating_avg ?? 0).toFixed(1) }}</span>
        <span class="text-slate-400">
          ({{ fmtAngka(course.rating_count ?? 0) }} {{ t('common.unit.review', Number(course.rating_count ?? 0)) }})
        </span>
        <span v-if="course.student_count" class="ms-auto text-slate-400">
          {{ fmtAngka(course.student_count) }} {{ t('common.unit.student', Number(course.student_count)) }}
        </span>
      </div>

      <div class="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
        <div>
          <span class="text-lg font-bold text-brand-500">{{ fmtHarga(course.price) }}</span>
          <span v-if="discount" class="ms-1.5 text-xs text-slate-400 line-through">{{ fmtHarga(course.strike_price!) }}</span>
        </div>
        <span class="flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white transition group-hover:bg-brand-500">
          {{ t('catalog.card.viewCourse') }} <Icon name="arrow-right" :size="11" class="rtl-flip" />
        </span>
      </div>
    </div>
  </RouterLink>
</template>
