<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet } from '@/lib/api';
import { sanitizeHtml } from '@/lib/sanitize';
import { useAppConfigStore } from '@/stores/appConfig';

/**
 * Halaman statis publik (About, Help Center, Privacy, Terms, Contact, …),
 * managed admin di Website → Pages. Hanya halaman berstatus publish yang
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
  <div v-if="loading" class="py-20 text-center text-sm text-slate-400">{{ t('common.state.loading') }}</div>

  <div v-else-if="notFound" class="py-20 text-center">
    <h1 class="text-2xl font-bold text-slate-900">{{ t('pages.public.notFoundTitle') }}</h1>
    <p class="mt-2 text-slate-500">{{ t('pages.public.notFoundText') }}</p>
    <RouterLink to="/" class="btn-primary mt-6 inline-flex">{{ t('pages.public.backHome') }}</RouterLink>
  </div>

  <div v-else-if="page" class="w-full">
    <!-- Hero Section with gradient background -->
    <div class="bg-gradient-to-r from-rose-50 via-slate-50 to-sky-50 py-12 md:py-20 w-full border-b border-slate-100">
      <div class="container mx-auto px-4 text-center">
        <h1 class="text-3xl font-bold text-slate-900 md:text-5xl tracking-tight">{{ page.title }}</h1>
        <div class="mt-4 text-sm text-slate-500 font-medium flex items-center justify-center space-x-2">
          <RouterLink to="/" class="hover:text-primary transition-colors">{{ t('pages.public.backHome', 'Home') }}</RouterLink>
          <span class="text-red-500 font-bold">—</span>
          <span class="text-slate-700">{{ page.title }}</span>
        </div>
      </div>
    </div>
    
    <!-- Page Content -->
    <div class="mx-auto max-w-3xl px-4 py-12">
      <article>
        <!-- eslint-disable-next-line vue/no-v-html -- content dilewatkan sanitizeHtml() lebih dulu; view src/lib/sanitize.ts -->
        <div class="prose-page mt-6" v-html="html"></div>
      </article>
    </div>
  </div>
</template>
