<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGetFull, apiPost, apiPut, errorMessage } from '@/lib/api';
import { fmtTanggal, fmtRelatif } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import PageHeader from '@/components/ui/PageHeader.vue';
import RichTextEditor from '@/components/ui/RichTextEditor.vue';
import MediaUploadButton from '@/modules/content/components/MediaUploadButton.vue';
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
const filterSearch = ref<string>('');

// Form state
const showModal = ref(false);
const editingId = ref<string | null>(null);
const formSaving = ref(false);
const formError = ref('');
const slugAuto = ref(true);

const form = reactive({
  title: '',
  slug: '',
  summary: '',
  content: '',
  cover_image_url: '',
  author_name: '',
  category: 'Fire Safety',
  tagsString: '',
  status: 'published' as BlogPost['status'],
});

const CATEGORY_OPTIONS = [
  'Fire Safety',
  'Industrial Safety',
  'Electrical Safety',
  'Emergency Response',
  'Workplace Health',
  'Regulations & Standards',
  'General',
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));

function showNotice(msg: string) {
  notice.value = msg;
  setTimeout(() => (notice.value = ''), 3500);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function onTitleInput() {
  if (slugAuto.value) {
    form.slug = slugify(form.title);
  }
}

function openCreateModal() {
  editingId.value = null;
  formError.value = '';
  slugAuto.value = true;
  form.title = '';
  form.slug = '';
  form.summary = '';
  form.content = '';
  form.cover_image_url = '';
  form.author_name = auth.user?.name_lengkap || 'NFSI Faculty';
  form.category = 'Fire Safety';
  form.tagsString = 'Safety, NFSI';
  form.status = 'published';
  showModal.value = true;
}

function openEditModal(post: BlogPost) {
  editingId.value = post.id;
  formError.value = '';
  slugAuto.value = false;
  form.title = post.title;
  form.slug = post.slug;
  form.summary = post.summary || '';
  form.content = post.content || '';
  form.cover_image_url = post.cover_image_url || '';
  form.author_name = post.author_name || '';
  form.category = post.category || 'General';
  form.tagsString = Array.isArray(post.tags) ? post.tags.join(', ') : '';
  form.status = (post.status as any) || 'draft';
  showModal.value = true;
}

function onCoverUploaded(asset: { url?: string; path?: string }) {
  if (asset.url) {
    form.cover_image_url = asset.url;
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
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterSearch.value.trim()) params.search = filterSearch.value.trim();

    const res = await apiGetFull<BlogPost[]>('/blogs', params);
    posts.value = res.data ?? [];
    total.value = res.meta?.total ?? posts.value.length;
  } catch (e: any) {
    error.value = errorMessage(e, 'Failed to load blog posts');
    posts.value = [];
  } finally {
    loading.value = false;
  }
}

async function savePost() {
  formError.value = '';
  if (!form.title.trim()) {
    formError.value = 'Article title is required';
    return;
  }
  if (!form.slug.trim()) {
    formError.value = 'URL slug is required';
    return;
  }
  if (!form.content.trim()) {
    formError.value = 'Article content cannot be empty';
    return;
  }

  const tags = form.tagsString
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const payload = {
    title: form.title.trim(),
    slug: form.slug.trim(),
    summary: form.summary.trim() || null,
    content: form.content.trim(),
    cover_image_url: form.cover_image_url.trim() || null,
    author_name: form.author_name.trim() || null,
    category: form.category.trim() || 'General',
    tags,
    status: form.status,
  };

  formSaving.value = true;
  try {
    if (editingId.value) {
      await apiPut(`/blogs/${editingId.value}`, payload);
      showNotice('Blog post updated successfully!');
    } else {
      await apiPost('/blogs', payload);
      showNotice('Blog post created and saved successfully!');
    }
    showModal.value = false;
    await loadPosts();
  } catch (e: any) {
    formError.value = errorMessage(e, 'Failed to save blog post');
  } finally {
    formSaving.value = false;
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
});
</script>

<template>
  <div>
    <PageHeader
      title="Blog Posts"
      description="Create, edit, view, and manage articles and educational posts displayed on your website."
    >
      <template #actions>
        <button
          v-if="auth.can('content.create')"
          type="button"
          class="btn-primary flex items-center gap-2"
          @click="openCreateModal"
        >
          <Icon name="plus" :size="16" />
          <span>New Article</span>
        </button>
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
        <p class="text-xs text-slate-400 mt-1">Click "New Article" to publish your first post!</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th class="px-4 py-3">Article</th>
              <th class="px-4 py-3">Category</th>
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
                  <button
                    v-if="auth.can('content.update')"
                    type="button"
                    class="btn-outline px-2 py-1 text-slate-700"
                    @click="openEditModal(post)"
                  >
                    Edit
                  </button>
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

    <!-- Create / Edit Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto"
      @click.self="showModal = false"
    >
      <div class="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl my-8 max-h-[90vh] flex flex-col">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 class="text-lg font-bold text-slate-900">
            {{ editingId ? 'Edit Article' : 'Create New Article' }}
          </h2>
          <button
            type="button"
            class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            @click="showModal = false"
          >
            <Icon name="x" :size="20" />
          </button>
        </div>

        <!-- Modal Body (Scrollable) -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <div v-if="formError" class="alert-error">
            {{ formError }}
          </div>

          <!-- Title -->
          <div>
            <label class="label font-medium">Article Title *</label>
            <input
              v-model="form.title"
              type="text"
              class="input text-base font-semibold"
              placeholder="e.g. 10 Essential Workplace Fire Safety Protocols"
              @input="onTitleInput"
            />
          </div>

          <!-- Slug -->
          <div>
            <div class="flex items-center justify-between">
              <label class="label font-medium mb-0">URL Slug *</label>
              <button
                type="button"
                class="text-[11px] text-brand-600 hover:underline"
                @click="slugAuto = !slugAuto; onTitleInput()"
              >
                {{ slugAuto ? 'Edit Manually' : 'Auto-Generate' }}
              </button>
            </div>
            <div class="mt-1 flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 focus-within:border-brand-500 focus-within:bg-white">
              <span>/blog/</span>
              <input
                v-model="form.slug"
                type="text"
                class="flex-1 bg-transparent font-mono outline-none text-slate-800"
                placeholder="article-slug"
              />
            </div>
          </div>

          <!-- Category & Status -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label font-medium">Category</label>
              <input
                v-model="form.category"
                list="category-suggestions"
                type="text"
                class="input"
                placeholder="e.g. Fire Safety"
              />
              <datalist id="category-suggestions">
                <option v-for="cat in CATEGORY_OPTIONS" :key="cat" :value="cat" />
              </datalist>
            </div>

            <div>
              <label class="label font-medium">Publication Status</label>
              <select v-model="form.status" class="input font-semibold">
                <option value="published">🟢 Published (Live on Website)</option>
                <option value="draft">🟡 Draft (Hidden from Website)</option>
                <option value="archived">⚪ Archived</option>
              </select>
            </div>
          </div>

          <!-- Author & Cover Image URL -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label font-medium">Author Name</label>
              <input
                v-model="form.author_name"
                type="text"
                class="input"
                placeholder="e.g. NFSI Faculty / Dr. Sharma"
              />
            </div>

            <div>
              <label class="label font-medium">Tags (comma-separated)</label>
              <input
                v-model="form.tagsString"
                type="text"
                class="input"
                placeholder="Fire Safety, OSHA, Training"
              />
            </div>
          </div>

          <!-- Cover Image -->
          <div>
            <label class="label font-medium">Cover Image URL</label>
            <div class="flex items-center gap-2">
              <input
                v-model="form.cover_image_url"
                type="url"
                class="input flex-1"
                placeholder="https://images.unsplash.com/... or uploaded file"
              />
              <MediaUploadButton
                v-can="'content.create'"
                accept="image/*"
                label="Upload"
                @uploaded="onCoverUploaded"
              />
            </div>
            <div v-if="form.cover_image_url" class="mt-2 h-24 w-40 overflow-hidden rounded border border-slate-200">
              <img :src="form.cover_image_url" class="h-full w-full object-cover" />
            </div>
          </div>

          <!-- Summary / Excerpt -->
          <div>
            <label class="label font-medium">Short Summary / Excerpt (Optional)</label>
            <textarea
              v-model="form.summary"
              rows="2"
              class="input text-xs"
              placeholder="A brief 1-2 sentence overview to show on the blog listing cards and search engines..."
            ></textarea>
          </div>

          <!-- Full Content Editor -->
          <div>
            <label class="label font-medium">Article Content *</label>
            <RichTextEditor v-model="form.content" />
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 bg-slate-50 rounded-b-2xl">
          <button
            type="button"
            class="btn-outline btn-sm"
            :disabled="formSaving"
            @click="showModal = false"
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary btn-sm px-5"
            :disabled="formSaving"
            @click="savePost"
          >
            <span v-if="formSaving">Saving...</span>
            <span v-else>{{ editingId ? 'Update Article' : 'Publish Article' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
