<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet } from '@/lib/api';
import { sanitizeHtml } from '@/lib/sanitize';
import { useAppConfigStore } from '@/stores/appConfig';

/**
 * Halaman statis publik (About, Help Center, Privacy, Terms, Contact, …),
 * dikelola admin di Website → Pages. Hanya halaman berstatus terbit yang
 * dikembalikan backend; selain itu 404.
 */
interface Page {
  slug: string;
  title: string;
  content: { format?: string; html?: string } | null;
  updated_at: string;
}

const route = useRoute();
const { t } = useI18n();
const appConfig = useAppConfigStore();

const page = ref<Page | null>(null);
const loading = ref(true);
const notFound = ref(false);

const html = computed(() => sanitizeHtml(page.value?.content?.html ?? ''));

async function load(slug: string) {
  loading.value = true;
  notFound.value = false;
  page.value = null;
  try {
    page.value = await apiGet<Page>(`/pages/${encodeURIComponent(slug)}`);
    document.title = `${page.value.title} · ${appConfig.appName}`;
  } catch {
    notFound.value = true;
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.params.slug as string,
  (slug) => slug && load(slug),
  { immediate: true },
);
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-12">
    <div v-if="loading" class="py-20 text-center text-sm text-slate-400">{{ t('common.state.loading') }}</div>

    <div v-else-if="notFound" class="py-20 text-center">
      <h1 class="text-2xl font-bold text-slate-900">{{ t('pages.public.notFoundTitle') }}</h1>
      <p class="mt-2 text-slate-500">{{ t('pages.public.notFoundText') }}</p>
      <RouterLink to="/" class="btn-primary mt-6 inline-flex">{{ t('pages.public.backHome') }}</RouterLink>
    </div>

    <article v-else-if="page">
      <h1 class="text-3xl font-bold text-slate-900">{{ page.title }}</h1>
      <!-- eslint-disable-next-line vue/no-v-html -- isi dilewatkan sanitizeHtml() lebih dulu; lihat src/lib/sanitize.ts -->
      <div class="prose-page mt-6" v-html="html"></div>
    </article>
  </div>
</template>
