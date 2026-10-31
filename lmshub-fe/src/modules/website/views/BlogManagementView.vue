<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, errorMessage } from '@/lib/api';
import { fmtTanggal } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
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
  status: 'draft' | 'published' | 'archived';
  quiz_data?: {
    enabled?: boolean;
    title?: string;
    passing_score?: number;
    questions?: any[];
  } | null;
  published_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

const auth = useAuthStore();
const { t } = useI18n();

const posts = ref<BlogPost[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 10;
const loading = ref(true);
const error = ref('');
const notice = ref('');
const busy = ref(false);

const filterStatus = ref<string>('');
const filterCategory = ref<string>('');
const filterSearch = ref<string>('');
const dbCategories = ref<string[]>([]);

const DEFAULT_CATEGORIES = [
  'Industrial Safety',
  'Fire Safety',
  'Electrical Safety',
  'Chemical Safety',
  'Occupational Safety',
  'Emergency Response',
  'Workplace Health & Safety',
  'Construction Safety',
  'Environmental Safety',
  'Regulations & Standards',
  'General',
];

const allCategories = computed(() => {
  const merged = new Set([...DEFAULT_CATEGORIES, ...dbCategories.value]);
  return Array.from(merged);
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));

function showNotice(msg: string) {
  notice.value = msg;
  setTimeout(() => (notice.value = ''), 3500);
}

async function loadCategories() {
  try {
    const res = await apiGetFull<string[]>('/blogs/categories');
    if (res?.data && Array.isArray(res.data)) {
      dbCategories.value = res.data;
    }
  } catch {}
}

async function loadPosts() {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, any> = {
      page: page.value,
      limit,
    };
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterCategory.value) params.category = filterCategory.value;
    if (filterSearch.value.trim()) params.search = filterSearch.value.trim();

    const res = await apiGetFull<BlogPost[]>('/blogs', params);
    posts.value = res.data ?? [];
    total.value = (res.meta?.total as number) ?? posts.value.length;
  } catch (e: any) {
    error.value = errorMessage(e, 'Failed to load blog posts');
    posts.value = [];
  } finally {
    loading.value = false;
  }
}

async function deletePost(post: BlogPost) {
  if (!window.confirm(`Are you sure you want to delete "${post.title}"?`)) return;
  busy.value = true;
  try {
    await apiDelete(`/blogs/${post.id}`);
    showNotice('Blog post deleted successfully');
    await loadPosts();
  } catch (e: any) {
    error.value = errorMessage(e, 'Failed to delete blog post');
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  loadPosts();
  loadCategories();
});
</script>

<template>
  <div>
    <PageHeader
      title="Blog Posts"
      description="Create, edit, view, and manage articles and educational posts displayed on your website."
    >
      <template #actions>
        <RouterLink
          v-if="auth.can('content.create')"
          to="/d/blogs/create"
          class="btn-primary flex items-center gap-2 shadow-xs"
        >
          <Icon name="plus" :size="16" />
          <span>New Article</span>
        </RouterLink>
      </template>
    </PageHeader>

    <div v-if="notice" class="mb-4 alert-success">
      {{ notice }}
    </div>

    <!-- Filters Bar -->
    <div class="card mb-6 p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-1 flex-wrap items-center gap-3">
          <div class="relative min-w-[220px] max-w-sm flex-1">
            <input
              v-model="filterSearch"
              type="search"
              placeholder="Search posts by title or keyword..."
              class="input pl-8"
              @keyup.enter="page = 1; loadPosts()"
            />
            <Icon name="search" :size="14" class="absolute left-2.5 top-3 text-slate-400" />
          </div>

          <select v-model="filterStatus" class="input w-36" @change="page = 1; loadPosts()">
            <option value="">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>

          <select v-model="filterCategory" class="input w-44" @change="page = 1; loadPosts()">
            <option value="">All Categories</option>
            <option v-for="cat in allCategories" :key="cat" :value="cat">{{ cat }}</option>
          </select>

          <button type="button" class="btn-outline btn-sm" @click="page = 1; loadPosts()">
            Filter
          </button>
        </div>

        <div class="text-xs text-slate-500">
          Total: <strong class="text-slate-800">{{ total }}</strong> posts
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="error" class="mb-4 alert-error">
      {{ error }}
    </div>

    <!-- Posts Table -->
    <div class="card overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-sm text-slate-400">
        Loading blog posts...
      </div>

      <div v-else-if="posts.length === 0" class="p-12 text-center text-slate-500">
        <div class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400 mb-2">
          <Icon name="book-open" :size="24" />
        </div>
        <p class="font-medium text-slate-700">No blog posts found</p>
        <p class="text-xs text-slate-400 mt-1">Click "New Article" to write and publish your first post!</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th class="px-4 py-3">Article</th>
              <th class="px-4 py-3">Category</th>
              <th class="px-4 py-3">Quiz & Cert</th>
              <th class="px-4 py-3">Author</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Views</th>
              <th class="px-4 py-3">Date</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="post in posts" :key="post.id" class="hover:bg-slate-50/80 transition-colors">
              <!-- Article Title & Cover -->
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="h-10 w-14 shrink-0 overflow-hidden rounded bg-slate-100 border border-slate-200">
                    <img
                      v-if="post.cover_image_url"
                      :src="post.cover_image_url"
                      :alt="post.title"
                      class="h-full w-full object-cover"
                    />
                    <div v-else class="grid h-full w-full place-items-center text-slate-400">
                      <Icon name="image" :size="14" />
                    </div>
                  </div>
                  <div class="min-w-0">
                    <div class="font-semibold text-slate-900 truncate max-w-md">
                      {{ post.title }}
                    </div>
                    <div class="text-[11px] text-slate-400 font-mono truncate max-w-xs">
                      /blog/{{ post.slug }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Category -->
              <td class="px-4 py-3">
                <span class="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {{ post.category || 'General' }}
                </span>
              </td>

              <!-- Quiz & Cert Badge -->
              <td class="px-4 py-3">
                <span
                  v-if="post.quiz_data?.enabled"
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200"
                >
                  <span>🎓</span>
                  <span>Quiz ({{ post.quiz_data.questions?.length || 0 }} Qs)</span>
                </span>
                <span v-else class="text-[11px] text-slate-400">
                  None
                </span>
              </td>

              <!-- Author -->
              <td class="px-4 py-3 text-slate-600 font-medium">
                {{ post.author_name || '—' }}
              </td>

              <!-- Status -->
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  :class="
                    post.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : post.status === 'draft'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-slate-100 text-slate-600'
                  "
                >
                  {{ post.status.toUpperCase() }}
                </span>
              </td>

              <!-- Views -->
              <td class="px-4 py-3 text-slate-600">
                {{ post.view_count || 0 }}
              </td>

              <!-- Date -->
              <td class="px-4 py-3 text-slate-500 whitespace-nowrap">
                {{ fmtTanggal(post.published_at || post.created_at) }}
              </td>

              <!-- Actions -->
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <a
                    :href="`/blog/${post.slug}`"
                    target="_blank"
                    class="btn-outline px-2 py-1 text-slate-600 hover:text-brand-600"
                    title="View public page"
                  >
                    <Icon name="external-link" :size="13" />
                  </a>
                  <RouterLink
                    v-if="auth.can('content.update')"
                    :to="`/d/blogs/${post.id}/edit`"
                    class="btn-outline px-2.5 py-1 text-slate-700 hover:text-brand-600 hover:border-brand-300 font-medium"
                  >
                    Edit
                  </RouterLink>
                  <button
                    v-if="auth.can('content.delete')"
                    type="button"
                    class="btn-outline px-2 py-1 text-rose-600 hover:bg-rose-50"
                    :disabled="busy"
                    @click="deletePost(post)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs">
        <span class="text-slate-500">
          Showing page {{ page }} of {{ totalPages }}
        </span>
        <div class="flex gap-1.5">
          <button class="btn-outline btn-sm" :disabled="page <= 1" @click="page--; loadPosts()">Previous</button>
          <button class="btn-outline btn-sm" :disabled="page >= totalPages" @click="page++; loadPosts()">Next</button>
        </div>
      </div>
    </div>
  </div>
</template>
