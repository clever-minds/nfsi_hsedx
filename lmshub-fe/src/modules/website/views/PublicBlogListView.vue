<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGetFull } from '@/lib/api';
import { fmtTanggal } from '@/lib/format';
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

const posts = ref<BlogPost[]>([]);
const total = ref(0);
const page = ref(Number(route.query.page || 1));
const limit = 9;
const loading = ref(true);
const error = ref('');

const categories = ref<string[]>(['All']);
const selectedCategory = ref<string>((route.query.category as string) || 'All');
const searchInput = ref<string>((route.query.search as string) || '');
const activeSearch = ref<string>((route.query.search as string) || '');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));

async function loadCategories() {
  try {
    const res = await apiGetFull<string[]>('/blogs/public/categories');
    if (res?.data && res.data.length > 0) {
      categories.value = ['All', ...res.data];
    }
  } catch {
    // ignore
  }
}

async function loadPosts() {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, any> = {
      page: page.value,
      limit,
    };
    if (selectedCategory.value && selectedCategory.value !== 'All') {
      params.category = selectedCategory.value;
    }
    if (activeSearch.value) {
      params.search = activeSearch.value;
    }

    const res = await apiGetFull<BlogPost[]>('/blogs/public', params);
    posts.value = res.data ?? [];
    total.value = res.meta?.total ?? posts.value.length;
  } catch (e: any) {
    error.value = e?.message || 'Failed to load blog posts';
    posts.value = [];
  } finally {
    loading.value = false;
  }
}

function selectCategory(cat: string) {
  selectedCategory.value = cat;
  page.value = 1;
  updateRoute();
  loadPosts();
}

function handleSearch() {
  activeSearch.value = searchInput.value.trim();
  page.value = 1;
  updateRoute();
  loadPosts();
}

function goToPage(p: number) {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
  updateRoute();
  loadPosts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateRoute() {
  const query: Record<string, any> = {};
  if (page.value > 1) query.page = page.value;
  if (selectedCategory.value && selectedCategory.value !== 'All') query.category = selectedCategory.value;
  if (activeSearch.value) query.search = activeSearch.value;
  router.replace({ query });
}

function getReadingTime(content: string): string {
  const words = content.replace(/<[^>]*>/g, '').trim().split(/\s+/).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

onMounted(() => {
  loadCategories();
  loadPosts();
});
</script>

<template>
  <div class="min-h-screen bg-slate-50/50 pb-20">
    <!-- Hero Banner -->
    <section class="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 py-16 text-white sm:py-20">
      <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
      <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-brand-500/20 border border-brand-400/30 px-3.5 py-1 text-xs font-semibold text-brand-300">
          <Icon name="book-open" :size="14" /> Knowledge Base &amp; Insights
        </span>
        <h1 class="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
          NFSI Safety &amp; Technical Blog
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-base text-slate-300 sm:text-lg">
          Expert articles, industry safety standards, best practices, and practical guides curated by accredited safety specialists.
        </p>

        <!-- Search input in hero -->
        <div class="mx-auto mt-8 max-w-xl">
          <form class="flex items-center gap-2 rounded-xl bg-white/10 p-1.5 backdrop-blur-md border border-white/20 focus-within:bg-white focus-within:border-brand-500 transition-all shadow-xl" @submit.prevent="handleSearch">
            <div class="flex flex-1 items-center gap-2.5 px-3">
              <Icon name="search" :size="18" class="text-slate-400" />
              <input
                v-model="searchInput"
                type="search"
                placeholder="Search articles by title, topic, or keyword..."
                class="w-full bg-transparent text-sm text-slate-900 focus:outline-none placeholder:text-slate-400 focus-within:text-slate-900"
              />
            </div>
            <button type="submit" class="btn-primary rounded-lg px-5 py-2.5 text-xs font-semibold">
              Search
            </button>
          </form>
        </div>
      </div>
    </section>

    <!-- Content Section -->
    <div class="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      <!-- Category Tabs -->
      <div class="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            class="rounded-full px-4 py-1.5 text-xs font-semibold transition"
            :class="selectedCategory === cat ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'"
            @click="selectCategory(cat)"
          >
            {{ cat }}
          </button>
        </div>

        <div v-if="activeSearch" class="flex items-center gap-2 text-xs text-slate-500">
          <span>Search results for: <strong>"{{ activeSearch }}"</strong></span>
          <button type="button" class="text-rose-600 hover:underline" @click="searchInput = ''; handleSearch()">Clear</button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 6" :key="n" class="card overflow-hidden animate-pulse">
          <div class="h-48 bg-slate-200"></div>
          <div class="p-5 space-y-3">
            <div class="h-4 w-24 bg-slate-200 rounded"></div>
            <div class="h-6 w-3/4 bg-slate-200 rounded"></div>
            <div class="h-12 w-full bg-slate-100 rounded"></div>
          </div>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="card p-8 text-center">
        <p class="text-rose-600 text-sm font-medium">{{ error }}</p>
        <button class="btn-outline btn-sm mt-3" @click="loadPosts">Try Again</button>
      </div>

      <!-- Empty State -->
      <div v-else-if="posts.length === 0" class="card p-12 text-center">
        <div class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
          <Icon name="book-open" :size="24" />
        </div>
        <h3 class="text-base font-semibold text-slate-800">No blog posts found</h3>
        <p class="mt-1 text-xs text-slate-500">
          {{ activeSearch ? 'Try a different search term or category.' : 'New articles will be published soon!' }}
        </p>
      </div>

      <!-- Posts Grid -->
      <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="post in posts"
          :key="post.id"
          class="card group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg border-slate-200/80"
        >
          <!-- Cover Image -->
          <RouterLink :to="{ name: 'public-blog-post', params: { slug: post.slug } }" class="relative block aspect-[16/9] w-full overflow-hidden bg-slate-100">
            <img
              v-if="post.cover_image_url"
              :src="post.cover_image_url"
              :alt="post.title"
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div v-else class="grid h-full w-full place-items-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
              <Icon name="book-open" :size="36" />
            </div>
            <span class="absolute top-3 left-3 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700 shadow-sm backdrop-blur">
              {{ post.category || 'General' }}
            </span>
          </RouterLink>

          <!-- Card Body -->
          <div class="flex flex-1 flex-col p-5">
            <div class="flex items-center gap-2 text-xs text-slate-400 mb-2.5">
              <span>{{ fmtTanggal(post.published_at || post.created_at) }}</span>
              <span>•</span>
              <span>{{ getReadingTime(post.content) }}</span>
            </div>

            <h2 class="text-lg font-bold leading-snug text-slate-900 group-hover:text-brand-600 transition-colors">
              <RouterLink :to="{ name: 'public-blog-post', params: { slug: post.slug } }">
                {{ post.title }}
              </RouterLink>
            </h2>

            <p class="mt-2.5 flex-1 text-xs leading-relaxed text-slate-600 line-clamp-3">
              {{ post.summary || (post.content.replace(/<[^>]*>/g, '').slice(0, 140) + '…') }}
            </p>

            <!-- Card Footer -->
            <div class="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
              <div class="flex items-center gap-2">
                <div class="grid h-6 w-6 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700 border border-brand-200">
                  {{ (post.author_name || 'NFSI')[0] }}
                </div>
                <span class="font-medium text-slate-700">{{ post.author_name || 'NFSI Faculty' }}</span>
              </div>
              <RouterLink
                :to="{ name: 'public-blog-post', params: { slug: post.slug } }"
                class="font-semibold text-brand-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1"
              >
                Read <span aria-hidden="true">&rarr;</span>
              </RouterLink>
            </div>
          </div>
        </article>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-12 flex items-center justify-center gap-2">
        <button
          class="btn-outline btn-sm"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
        >
          Previous
        </button>
        <span class="px-3 text-xs font-semibold text-slate-600">
          Page {{ page }} of {{ totalPages }}
        </span>
        <button
          class="btn-outline btn-sm"
          :disabled="page >= totalPages"
          @click="goToPage(page + 1)"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
