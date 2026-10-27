<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull } from '@/lib/api';
import { fmtTanggal } from '@/lib/format';
import { sanitizeHtml } from '@/lib/sanitize';
import { setMetaTags, resetMetaTags } from '@/lib/seo';
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
const topPosts = ref<BlogPost[]>([]);
const dbCategories = ref<string[]>([]);
const loading = ref(true);
const error = ref('');
const copied = ref(false);
const scrollProgress = ref(0);

const DEFAULT_CATEGORIES = [
  'Industrial Safety',
  'Fire Safety',
  'Electrical Safety',
  'Chemical Safety',
  'Occupational Safety',
  'Emergency Response',
  'Construction Safety',
  'Workplace Health & Safety',
];

const allCategories = computed(() => {
  const set = new Set([...DEFAULT_CATEGORIES, ...dbCategories.value]);
  return Array.from(set);
});

const readingTime = computed(() => {
  if (!post.value?.content) return '1 min read';
  const words = post.value.content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
});

function handleScroll() {
  if (typeof window === 'undefined') return;
  const total = document.documentElement.scrollHeight - window.innerHeight;
  if (total > 0) {
    scrollProgress.value = Math.min(100, Math.max(0, (window.scrollY / total) * 100));
  }
}

async function loadPost() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<BlogPost>(`/blogs/public/${slug.value}`);
    post.value = res.data ?? null;
    if (!post.value) {
      error.value = 'Article not found';
    } else {
      // Dynamic SEO Meta & Social Tags
      let ogImage = post.value.cover_image_url || '';
      if (ogImage && !ogImage.startsWith('http') && typeof window !== 'undefined') {
        ogImage = window.location.origin + (ogImage.startsWith('/') ? '' : '/') + ogImage;
      }
      if (!ogImage) {
        ogImage = 'https://hsedx.nfsi.in/uploads/branding/logo-1792142496827.png';
      }

      const excerpt = post.value.summary || post.value.content || '';
      const articleUrl = typeof window !== 'undefined' ? window.location.href : '';

      setMetaTags({
        title: post.value.title,
        description: excerpt,
        keywords: post.value.tags,
        image: ogImage,
        url: articleUrl,
        type: 'article',
        author: post.value.author_name || 'NFSI Safety Faculty',
        publishedTime: post.value.published_at || post.value.created_at,
        category: post.value.category,
        tags: post.value.tags,
        siteName: 'HSEdx · National Fire & Safety',
      });
    }
  } catch (e: any) {
    error.value = e?.message || 'Article could not be loaded';
  } finally {
    loading.value = false;
  }
}

async function loadSidebar() {
  try {
    const [topRes, catRes] = await Promise.all([
      apiGetFull<BlogPost[]>('/blogs/public', { limit: 5 }),
      apiGetFull<string[]>('/blogs/public/categories'),
    ]);
    topPosts.value = topRes.data ?? [];
    if (catRes?.data && Array.isArray(catRes.data)) {
      dbCategories.value = catRes.data;
    }
  } catch {}
}

function shareOn(platform: 'facebook' | 'x' | 'linkedin' | 'whatsapp') {
  if (typeof window === 'undefined') return;
  // Use SSR social preview URL so WhatsApp, LinkedIn, Twitter/X, and Facebook bots get instant rich preview cards
  const shareTargetUrl = `${window.location.origin}/api/v1/blogs/share/${slug.value}`;
  const url = encodeURIComponent(shareTargetUrl);
  const title = encodeURIComponent(post.value?.title || 'NFSI Safety Article');

  let shareUrl = '';
  switch (platform) {
    case 'whatsapp':
      shareUrl = `https://api.whatsapp.com/send?text=${title}%20${url}`;
      break;
    case 'x':
      shareUrl = `https://twitter.com/intent/tweet?text=${title}&url=${url}`;
      break;
    case 'linkedin':
      shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
      break;
    case 'facebook':
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
      break;
  }
  if (shareUrl) {
    window.open(shareUrl, '_blank', 'noopener,noreferrer,width=650,height=550');
  }
}

function copyLink() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2500);
  }
}

watch(
  () => route.params.slug,
  (newSlug) => {
    if (newSlug) {
      loadPost();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },
);

onMounted(() => {
  loadPost();
  loadSidebar();
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, { passive: true });
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('scroll', handleScroll);
  }
  resetMetaTags();
});
</script>

<template>
  <div class="relative min-h-screen bg-slate-50/60 pb-20">
    <!-- Reading Progress Indicator (Fixed at Top of Screen) -->
    <div class="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent pointer-events-none">
      <div
        class="h-full bg-gradient-to-r from-brand-600 via-amber-500 to-emerald-500 transition-all duration-100 ease-out"
        :style="{ width: `${scrollProgress}%` }"
      ></div>
    </div>

    <!-- Breadcrumb bar -->
    <div class="border-b border-slate-200/80 bg-white/95 backdrop-blur-sm sticky top-16 z-30 shadow-xs">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
        <div class="flex items-center gap-2 text-xs">
          <RouterLink
            to="/blog"
            class="inline-flex items-center gap-1.5 font-semibold text-slate-600 transition hover:text-brand-600"
          >
            <span>&larr;</span> All Articles
          </RouterLink>
          <span v-if="post?.category" class="text-slate-300">/</span>
          <RouterLink
            v-if="post?.category"
            :to="{ path: '/blog', query: { category: post.category } }"
            class="font-semibold text-brand-600 hover:underline transition truncate max-w-[150px] sm:max-w-none"
          >
            {{ post.category }}
          </RouterLink>
        </div>

        <!-- Header Quick Social Share Icons -->
        <div class="flex items-center gap-1.5 sm:gap-2">
          <span class="hidden sm:inline text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Share:</span>
          
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition shadow-2xs"
            title="Share on WhatsApp"
            @click="shareOn('whatsapp')"
          >
            <Icon name="whatsapp" :size="15" />
          </button>

          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg bg-[#0A66C2]/10 text-[#0A66C2] hover:bg-[#0A66C2] hover:text-white transition shadow-2xs"
            title="Share on LinkedIn"
            @click="shareOn('linkedin')"
          >
            <Icon name="linkedin" :size="15" />
          </button>

          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg bg-slate-900/10 text-slate-800 hover:bg-black hover:text-white transition shadow-2xs"
            title="Share on X"
            @click="shareOn('x')"
          >
            <Icon name="x-social" :size="13" />
          </button>

          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-lg bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2] hover:text-white transition shadow-2xs"
            title="Share on Facebook"
            @click="shareOn('facebook')"
          >
            <Icon name="facebook" :size="15" />
          </button>

          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs ml-1"
            :class="copied ? 'text-emerald-600 border-emerald-300 bg-emerald-50' : ''"
            title="Copy Article Link"
            @click="copyLink"
          >
            <Icon :name="copied ? 'check' : 'link'" :size="13" />
            <span class="hidden sm:inline">{{ copied ? 'Copied!' : 'Copy' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Floating Sticky Share Bar on Left for Wide Screens (xl+) -->
    <aside class="hidden xl:flex fixed left-6 top-48 z-20 flex-col items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-lg backdrop-blur-md">
      <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">Share</span>
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-[#25D366] hover:text-white transition"
        title="Share on WhatsApp"
        @click="shareOn('whatsapp')"
      >
        <Icon name="whatsapp" :size="17" />
      </button>
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-[#0A66C2] hover:text-white transition"
        title="Share on LinkedIn"
        @click="shareOn('linkedin')"
      >
        <Icon name="linkedin" :size="17" />
      </button>
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-black hover:text-white transition"
        title="Share on X"
        @click="shareOn('x')"
      >
        <Icon name="x-social" :size="15" />
      </button>
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-[#1877F2] hover:text-white transition"
        title="Share on Facebook"
        @click="shareOn('facebook')"
      >
        <Icon name="facebook" :size="17" />
      </button>
      <span class="h-px w-5 bg-slate-200 my-0.5"></span>
      <button
        type="button"
        class="grid h-9 w-9 place-items-center rounded-xl transition"
        :class="copied ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'"
        title="Copy Link"
        @click="copyLink"
      >
        <Icon :name="copied ? 'check' : 'link'" :size="15" />
      </button>
    </aside>

    <!-- Loading State -->
    <div v-if="loading" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div class="lg:grid lg:grid-cols-12 lg:gap-8">
        <div class="lg:col-span-8 space-y-4">
          <div class="h-8 w-2/3 bg-slate-200 rounded animate-pulse"></div>
          <div class="h-4 w-1/3 bg-slate-100 rounded animate-pulse"></div>
          <div class="h-80 w-full bg-slate-200 rounded-xl animate-pulse"></div>
          <div class="h-4 bg-slate-100 rounded animate-pulse"></div>
          <div class="h-4 bg-slate-100 rounded animate-pulse"></div>
        </div>
        <div class="mt-8 lg:mt-0 lg:col-span-4 space-y-4">
          <div class="h-64 bg-slate-200 rounded-xl animate-pulse"></div>
          <div class="h-48 bg-slate-200 rounded-xl animate-pulse"></div>
        </div>
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

    <!-- Main 2-Column Content Layout -->
    <div v-else class="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <div class="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
        <!-- Main Article (col-span-8) -->
        <article class="lg:col-span-8 min-w-0">
          <div class="card p-6 sm:p-10 bg-white border border-slate-200/90 shadow-sm rounded-2xl">
            <!-- Category Badge -->
            <div class="flex items-center justify-between gap-3">
              <RouterLink
                :to="{ path: '/blog', query: { category: post.category } }"
                class="inline-flex items-center rounded-md bg-brand-50 border border-brand-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700 hover:bg-brand-100 transition"
              >
                {{ post.category || 'General' }}
              </RouterLink>

              <div class="flex items-center gap-1.5 text-xs text-slate-400">
                <Icon name="clock" :size="13" />
                <span>{{ readingTime }}</span>
              </div>
            </div>

            <!-- Title -->
            <h1 class="mt-4 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl sm:leading-tight lg:text-4xl">
              {{ post.title }}
            </h1>

            <!-- Summary / Excerpt Quote -->
            <div
              v-if="post.summary"
              class="mt-5 text-sm sm:text-base leading-relaxed text-slate-600 border-l-4 border-brand-600 pl-4 py-2 italic bg-slate-50/70 rounded-r-xl"
              v-html="sanitizeHtml(post.summary)"
            ></div>

            <!-- Author & Metadata Bar -->
            <div class="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 border-y border-slate-100 py-3.5">
              <div class="flex items-center gap-2.5">
                <div class="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-xs">
                  {{ (post.author_name || 'NFSI')[0] }}
                </div>
                <div>
                  <div class="font-bold text-slate-900">{{ post.author_name || 'National Fire Safety Institute' }}</div>
                  <div class="text-[11px] text-slate-400">Published {{ fmtTanggal(post.published_at || post.created_at) }}</div>
                </div>
              </div>

              <!-- Top Share Pill -->
              <div class="flex items-center gap-1">
                <span class="text-[11px] font-semibold text-slate-400 mr-1">Share:</span>
                <button
                  type="button"
                  class="p-1.5 rounded-md hover:bg-slate-100 text-[#25D366] transition"
                  title="WhatsApp"
                  @click="shareOn('whatsapp')"
                >
                  <Icon name="whatsapp" :size="15" />
                </button>
                <button
                  type="button"
                  class="p-1.5 rounded-md hover:bg-slate-100 text-[#0A66C2] transition"
                  title="LinkedIn"
                  @click="shareOn('linkedin')"
                >
                  <Icon name="linkedin" :size="15" />
                </button>
                <button
                  type="button"
                  class="p-1.5 rounded-md hover:bg-slate-100 text-slate-900 transition"
                  title="X (Twitter)"
                  @click="shareOn('x')"
                >
                  <Icon name="x-social" :size="13" />
                </button>
                <button
                  type="button"
                  class="p-1.5 rounded-md hover:bg-slate-100 text-[#1877F2] transition"
                  title="Facebook"
                  @click="shareOn('facebook')"
                >
                  <Icon name="facebook" :size="15" />
                </button>
              </div>
            </div>

            <!-- Cover Image -->
            <div v-if="post.cover_image_url" class="mt-6 overflow-hidden rounded-xl shadow-md border border-slate-200/60 aspect-[16/9] w-full bg-slate-900">
              <img
                :src="post.cover_image_url"
                :alt="post.title"
                class="h-full w-full object-cover"
              />
            </div>

            <!-- Main Body Content with Pro Styling -->
            <div class="mt-8 border-t border-slate-100 pt-6">
              <div
                class="prose prose-slate max-w-none text-slate-800 text-[15px] sm:text-base prose-headings:font-extrabold prose-h2:text-2xl prose-h2:border-b prose-h2:border-slate-100 prose-h2:pb-2.5 prose-h2:mt-8 prose-h3:text-lg prose-h3:mt-6 prose-p:leading-relaxed prose-li:my-1.5 prose-img:rounded-xl prose-img:shadow-md"
                v-html="sanitizeHtml(post.content)"
              ></div>
            </div>

            <!-- Tags -->
            <div v-if="post.tags && post.tags.length > 0" class="mt-10 border-t border-slate-100 pt-6">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Related Topics</h4>
              <div class="flex flex-wrap gap-2">
                <RouterLink
                  v-for="tag in post.tags"
                  :key="tag"
                  :to="{ path: '/blog', query: { search: tag } }"
                  class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-600 transition"
                >
                  #{{ tag }}
                </RouterLink>
              </div>
            </div>

            <!-- Dedicated Social Sharing Box (WhatsApp, LinkedIn, X, Facebook) -->
            <div class="mt-10 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/70 p-6 border border-slate-200">
              <div class="sm:flex sm:items-center sm:justify-between gap-4">
                <div>
                  <h4 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Icon name="share-2" :size="16" class="text-brand-600" />
                    <span>Share This Safety Article</span>
                  </h4>
                  <p class="text-xs text-slate-500 mt-0.5">
                    Help your peers, safety officers, and students stay informed with crucial standards.
                  </p>
                </div>

                <!-- Social Buttons Group -->
                <div class="mt-4 sm:mt-0 flex flex-wrap items-center gap-2">
                  <!-- WhatsApp -->
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white px-3.5 py-2 text-xs font-bold shadow-xs hover:shadow-md transition active:scale-95"
                    @click="shareOn('whatsapp')"
                  >
                    <Icon name="whatsapp" :size="15" />
                    <span>WhatsApp</span>
                  </button>

                  <!-- LinkedIn -->
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-xl bg-[#0A66C2] hover:bg-[#084e96] text-white px-3.5 py-2 text-xs font-bold shadow-xs hover:shadow-md transition active:scale-95"
                    @click="shareOn('linkedin')"
                  >
                    <Icon name="linkedin" :size="15" />
                    <span>LinkedIn</span>
                  </button>

                  <!-- X (Twitter) -->
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-black text-white px-3.5 py-2 text-xs font-bold shadow-xs hover:shadow-md transition active:scale-95"
                    @click="shareOn('x')"
                  >
                    <Icon name="x-social" :size="13" />
                    <span>X</span>
                  </button>

                  <!-- Facebook -->
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-xl bg-[#1877F2] hover:bg-[#1464cc] text-white px-3.5 py-2 text-xs font-bold shadow-xs hover:shadow-md transition active:scale-95"
                    @click="shareOn('facebook')"
                  >
                    <Icon name="facebook" :size="15" />
                    <span>Facebook</span>
                  </button>

                  <!-- Copy Link -->
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 text-xs font-bold shadow-xs transition active:scale-95"
                    :class="copied ? 'text-emerald-600 border-emerald-400 bg-emerald-50' : ''"
                    @click="copyLink"
                  >
                    <Icon :name="copied ? 'check' : 'link'" :size="14" />
                    <span>{{ copied ? 'Link Copied!' : 'Copy Link' }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Author Bio Card -->
            <div class="mt-8 flex items-start gap-4 rounded-xl border border-slate-200/90 bg-slate-50/50 p-5">
              <div class="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-base font-black text-white shadow-sm">
                {{ (post.author_name || 'NFSI')[0] }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h4 class="text-sm font-bold text-slate-900">{{ post.author_name || 'National Fire Safety Institute Faculty' }}</h4>
                  <span class="rounded bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-bold text-brand-700">Verified Safety Faculty</span>
                </div>
                <p class="mt-1 text-xs text-slate-500 leading-relaxed">
                  Specialized in occupational safety, emergency mitigation protocols, hazard identification (HIRA), and industrial compliance standards.
                </p>
              </div>
            </div>

            <!-- Return & Next Footer Navigation -->
            <div class="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <RouterLink
                to="/blog"
                class="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline"
              >
                <span>&larr;</span> Back to All Articles
              </RouterLink>

              <RouterLink
                to="/courses"
                class="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-brand-600 transition"
              >
                <span>Explore Certified Safety Courses</span>
                <span aria-hidden="true">&rarr;</span>
              </RouterLink>
            </div>
          </div>

          <!-- Bottom CTA Career Banner -->
          <div class="mt-8 rounded-2xl bg-gradient-to-r from-slate-900 via-brand-900 to-slate-900 p-8 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <span class="inline-block rounded-md bg-brand-500/20 border border-brand-400/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-300 mb-2">
                NFSI Academy
              </span>
              <h3 class="text-xl font-bold">Advance Your Safety &amp; Fire Engineering Career</h3>
              <p class="mt-1.5 text-xs text-slate-300 max-w-lg leading-relaxed">
                Enroll in government-accredited diploma courses, gain practical safety mastery, and earn QR-verifiable certificates.
              </p>
            </div>
            <RouterLink to="/courses" class="btn-primary rounded-xl px-6 py-3 font-semibold whitespace-nowrap shadow-lg">
              Explore Courses
            </RouterLink>
          </div>
        </article>

        <!-- Right Sidebar (col-span-4) -->
        <aside class="mt-10 lg:mt-0 lg:col-span-4 space-y-6">
          <!-- Widget 1: Top 5 Blogs -->
          <div class="card p-5 bg-white border border-slate-200 shadow-sm rounded-2xl">
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div class="flex items-center gap-2">
                <span class="text-amber-500 font-bold text-base">🔥</span>
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900">Top 5 Articles</h3>
              </div>
              <RouterLink to="/blog" class="text-[11px] font-bold text-brand-600 hover:underline">
                View All
              </RouterLink>
            </div>

            <div class="space-y-3.5">
              <article
                v-for="(top, idx) in topPosts"
                :key="top.id"
                class="group flex gap-3 items-start pb-3.5 border-b border-slate-100 last:border-b-0 last:pb-0"
              >
                <span
                  class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold shadow-2xs transition"
                  :class="top.slug === post.slug ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-brand-50 group-hover:text-brand-600'"
                >
                  {{ idx + 1 }}
                </span>

                <div class="min-w-0 flex-1">
                  <span class="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700 mb-1">
                    {{ top.category || 'Safety' }}
                  </span>
                  <h4 class="text-xs font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-brand-600 transition">
                    <RouterLink :to="{ name: 'public-blog-post', params: { slug: top.slug } }">
                      {{ top.title }}
                    </RouterLink>
                  </h4>
                  <p class="text-[11px] text-slate-400 mt-1">
                    {{ fmtTanggal(top.published_at || top.created_at) }}
                  </p>
                </div>

                <RouterLink
                  v-if="top.cover_image_url"
                  :to="{ name: 'public-blog-post', params: { slug: top.slug } }"
                  class="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-100"
                >
                  <img
                    :src="top.cover_image_url"
                    :alt="top.title"
                    class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                </RouterLink>
              </article>
            </div>
          </div>

          <!-- Widget 2: Blog Categories -->
          <div class="card p-5 bg-white border border-slate-200 shadow-sm rounded-2xl">
            <div class="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <Icon name="folder" :size="16" class="text-brand-600" />
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-900">Blog Categories</h3>
            </div>

            <div class="flex flex-col gap-1">
              <RouterLink
                v-for="cat in allCategories"
                :key="cat"
                :to="{ path: '/blog', query: { category: cat } }"
                class="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition"
                :class="post?.category === cat ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700 hover:bg-slate-50 hover:text-brand-600'"
              >
                <span class="flex items-center gap-2 truncate">
                  <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :class="post?.category === cat ? 'bg-brand-600' : 'bg-slate-300'"
                  ></span>
                  <span class="truncate">{{ cat }}</span>
                </span>
                <span class="text-slate-400 text-[11px] shrink-0">&rarr;</span>
              </RouterLink>
            </div>
          </div>

          <!-- Widget 3: Accreditation & Training Card -->
          <div class="card p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 text-white shadow-lg border-0 rounded-2xl">
            <span class="inline-block rounded-md bg-brand-500/20 border border-brand-400/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-300 mb-2">
              National Fire Safety Institute
            </span>
            <h4 class="text-sm font-bold text-white leading-snug">
              Certified Safety &amp; Fire Engineering Programs
            </h4>
            <p class="text-xs text-slate-300 mt-2 leading-relaxed">
              Equip yourself with industry-standard qualifications, live classes, practical modules, and verifiable certificates.
            </p>
            <RouterLink
              to="/courses"
              class="btn-primary btn-sm w-full mt-4 text-center justify-center font-semibold rounded-lg shadow-md"
            >
              View All Courses
            </RouterLink>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>
