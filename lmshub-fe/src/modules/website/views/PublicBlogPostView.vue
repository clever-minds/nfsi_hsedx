<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull } from '@/lib/api';
import { fmtTanggal } from '@/lib/format';
import { sanitizeHtml } from '@/lib/sanitize';
import Icon from '@/components/ui/Icon.vue';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  cover_image_url: string | null;
  author_name: string | null;
  category: string;
  tags: string[];
  status: string;
  published_at: string | null;
  view_count: number;
  created_at: string;
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const slug = computed(() => route.params.slug as string);
const post = ref<BlogPost | null>(null);
const loading = ref(true);
const error = ref('');
const copied = ref(false);

const readingTime = computed(() => {
  if (!post.value?.content) return '1 min read';
  const words = post.value.content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
});

async function loadPost() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<BlogPost>(`/blogs/public/${slug.value}`);
    post.value = res.data ?? null;
    if (!post.value) {
      error.value = 'Article not found';
    }
  } catch (e: any) {
    error.value = e?.message || 'Article could not be loaded';
  } finally {
    loading.value = false;
  }
}

function copyLink() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2500);
  }
}

onMounted(() => {
  loadPost();
});
</script>

<template>
  <div class="min-h-screen bg-slate-50/50 pb-20">
    <!-- Breadcrumb bar -->
    <div class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
        <RouterLink
          to="/blog"
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-brand-600"
        >
          <span aria-hidden="true">&larr;</span> Back to all articles
        </RouterLink>

        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          @click="copyLink"
        >
          <Icon name="link" :size="14" />
          <span>{{ copied ? 'Link Copied!' : 'Share Article' }}</span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="mx-auto max-w-4xl px-4 py-16 text-center">
      <div class="h-8 w-1/2 bg-slate-200 rounded mx-auto mb-4 animate-pulse"></div>
      <div class="h-4 w-1/4 bg-slate-100 rounded mx-auto mb-8 animate-pulse"></div>
      <div class="h-72 w-full bg-slate-200 rounded-xl mb-8 animate-pulse"></div>
      <div class="space-y-4">
        <div class="h-4 bg-slate-100 rounded animate-pulse"></div>
        <div class="h-4 bg-slate-100 rounded animate-pulse"></div>
        <div class="h-4 w-3/4 bg-slate-100 rounded animate-pulse"></div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error || !post" class="mx-auto max-w-md px-4 py-20 text-center">
      <div class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600 mb-3">
        <Icon name="alert-triangle" :size="24" />
      </div>
      <h2 class="text-lg font-bold text-slate-900">{{ error || 'Post Not Found' }}</h2>
      <p class="mt-1 text-xs text-slate-500">The article you are looking for may have been moved or archived.</p>
      <RouterLink to="/blog" class="btn-primary btn-sm mt-4 inline-flex">
        Return to Blog List
      </RouterLink>
    </div>

    <!-- Post Article View -->
    <article v-else class="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <!-- Header Meta -->
      <div class="text-center">
        <span class="inline-flex items-center rounded-md bg-brand-50 border border-brand-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700">
          {{ post.category || 'General' }}
        </span>

        <h1 class="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-4xl sm:leading-tight">
          {{ post.title }}
        </h1>

        <div
          v-if="post.summary"
          class="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base prose-sm"
          v-html="sanitizeHtml(post.summary)"
        ></div>

        <!-- Author & Date pill -->
        <div class="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 border-y border-slate-200/80 py-3.5">
          <div class="flex items-center gap-2">
            <div class="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-sm">
              {{ (post.author_name || 'NFSI')[0] }}
            </div>
            <span class="font-semibold text-slate-800">{{ post.author_name || 'National Fire Safety Institute' }}</span>
          </div>
          <span>•</span>
          <span>Published {{ fmtTanggal(post.published_at || post.created_at) }}</span>
          <span>•</span>
          <span>{{ readingTime }}</span>
          <span v-if="post.view_count > 0">• {{ post.view_count }} views</span>
        </div>
      </div>

      <!-- Cover Image -->
      <div v-if="post.cover_image_url" class="mt-8 overflow-hidden rounded-2xl shadow-md border border-slate-200/60 aspect-[16/9] w-full bg-slate-900">
        <img
          :src="post.cover_image_url"
          :alt="post.title"
          class="h-full w-full object-cover"
        />
      </div>

      <!-- Main Body Content -->
      <div class="mt-10 card p-6 sm:p-10 bg-white border border-slate-200/90 shadow-sm">
        <div
          class="prose prose-slate max-w-none text-slate-800 prose-headings:font-bold prose-h2:text-2xl prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-2 prose-h3:text-lg prose-p:leading-relaxed prose-li:my-1"
          v-html="sanitizeHtml(post.content)"
        ></div>

        <!-- Tags -->
        <div v-if="post.tags && post.tags.length > 0" class="mt-10 border-t border-slate-100 pt-6">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Related Topics</h4>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="tag in post.tags"
              :key="tag"
              class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
            >
              #{{ tag }}
            </span>
          </div>
        </div>
      </div>

      <!-- CTA Banner -->
      <div class="mt-12 rounded-2xl bg-gradient-to-r from-slate-900 via-brand-900 to-slate-900 p-8 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <h3 class="text-xl font-bold">Advance Your Safety &amp; Fire Engineering Career</h3>
          <p class="mt-1.5 text-xs text-slate-300 max-w-lg">
            Enroll in NFSI government-accredited courses, gain practical safety mastery, and earn verifiable certificates.
          </p>
        </div>
        <RouterLink to="/courses" class="btn-primary rounded-xl px-6 py-3 font-semibold whitespace-nowrap shadow-lg">
          Explore Courses
        </RouterLink>
      </div>
    </article>
  </div>
</template>
