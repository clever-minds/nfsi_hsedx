<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiGetFull, apiPost, apiPut, errorMessage, assetUrl } from '@/lib/api';
import { fmtTanggal, fmtRelatif } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';
import RichTextEditor from '@/components/ui/RichTextEditor.vue';
import MediaUploadButton from '@/modules/content/components/MediaUploadButton.vue';
import Icon from '@/components/ui/Icon.vue';

interface QuizQuestionForm {
  id?: string;
  question: string;
  options: string[];
  correct_answer: number;
}

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
    questions?: QuizQuestionForm[];
  } | null;
  published_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const blogId = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => Boolean(blogId.value));

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const slugAuto = ref(!isEdit.value);
const customCategoryMode = ref(false);
const summaryRichMode = ref(false);
const dbCategories = ref<string[]>([]);

const postMeta = ref<{
  view_count: number;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
}>({
  view_count: 0,
});

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

const SUGGESTED_TAGS = [
  'Safety',
  'NFSI',
  'HAZMAT',
  'Chemical Safety',
  'Electrical Safety',
  'Fire Safety',
  'LOTO',
  'Compliance',
  'PPE',
  'Emergency Response',
  'OSHA',
];

const form = reactive({
  title: '',
  slug: '',
  summary: '',
  content: '',
  cover_image_url: '',
  author_name: '',
  category: 'Industrial Safety',
  tagsString: '',
  status: 'published' as BlogPost['status'],
  quiz_enabled: false,
  quiz_title: '',
  quiz_passing_score: 70,
  quiz_questions: [] as QuizQuestionForm[],
});

const allCategories = computed(() => {
  const merged = new Set([...DEFAULT_CATEGORIES, ...dbCategories.value]);
  return Array.from(merged);
});

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

function onCategorySelectChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  if (val === '__custom__') {
    customCategoryMode.value = true;
    form.category = '';
  } else {
    form.category = val;
  }
}

function quickAddTag(tag: string) {
  const currentTags = form.tagsString
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
    form.tagsString = currentTags.join(', ');
  }
}

function addQuizQuestion() {
  form.quiz_questions.push({
    id: 'q_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    question: '',
    options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
    correct_answer: 0,
  });
}

function removeQuizQuestion(index: number) {
  form.quiz_questions.splice(index, 1);
}

function addQuizOption(qIdx: number) {
  if (form.quiz_questions[qIdx].options.length < 6) {
    form.quiz_questions[qIdx].options.push('Option ' + (form.quiz_questions[qIdx].options.length + 1));
  }
}

function removeQuizOption(qIdx: number, optIdx: number) {
  if (form.quiz_questions[qIdx].options.length > 2) {
    form.quiz_questions[qIdx].options.splice(optIdx, 1);
    if (form.quiz_questions[qIdx].correct_answer >= form.quiz_questions[qIdx].options.length) {
      form.quiz_questions[qIdx].correct_answer = 0;
    }
  }
}

function onCoverUploaded(asset: { id: string; file_name: string; file_type: string; path_object_storage?: string }) {
  if (asset.path_object_storage) {
    form.cover_image_url = assetUrl(asset.path_object_storage);
  }
}

function showNotice(msg: string) {
  notice.value = msg;
  setTimeout(() => (notice.value = ''), 4000);
}

async function loadCategories() {
  try {
    const res = await apiGetFull<string[]>('/blogs/categories');
    if (res?.data && Array.isArray(res.data)) {
      dbCategories.value = res.data;
    }
  } catch {}
}

async function loadBlogData() {
  if (!blogId.value) {
    // Defaults for new article
    form.author_name = auth.user?.name_lengkap || 'NFSI Faculty';
    form.category = 'Industrial Safety';
    form.status = 'published';
    form.tagsString = 'Safety, NFSI';
    return;
  }

  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<BlogPost>(`/blogs/${blogId.value}`);
    if (!res?.data) {
      error.value = 'Blog post not found';
      return;
    }
    const post = res.data;
    form.title = post.title || '';
    form.slug = post.slug || '';
    form.summary = post.summary || '';
    summaryRichMode.value = Boolean(form.summary && /<[a-z][\s\S]*>/i.test(form.summary));
    form.content = post.content || '';
    form.cover_image_url = post.cover_image_url || '';
    form.author_name = post.author_name || '';
    form.category = post.category || 'Industrial Safety';
    customCategoryMode.value = !allCategories.value.includes(form.category);
    form.tagsString = Array.isArray(post.tags) ? post.tags.join(', ') : '';
    form.status = post.status || 'draft';

    const qd = post.quiz_data;
    form.quiz_enabled = Boolean(qd?.enabled);
    form.quiz_title = qd?.title || '';
    form.quiz_passing_score = qd?.passing_score ?? 70;
    form.quiz_questions = Array.isArray(qd?.questions) ? JSON.parse(JSON.stringify(qd.questions)) : [];

    postMeta.value = {
      view_count: post.view_count || 0,
      created_at: post.created_at,
      updated_at: post.updated_at,
      published_at: post.published_at,
    };
    slugAuto.value = false;
  } catch (e: any) {
    error.value = errorMessage(e, 'Failed to load blog post details');
  } finally {
    loading.value = false;
  }
}

async function savePost(targetStatus?: BlogPost['status']) {
  error.value = '';

  if (targetStatus) {
    form.status = targetStatus;
  }

  if (!form.title.trim()) {
    error.value = 'Article title is required.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (!form.slug.trim()) {
    error.value = 'URL slug is required.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (!form.content.trim()) {
    error.value = 'Article content cannot be empty.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (form.quiz_enabled) {
    if (!form.quiz_questions || form.quiz_questions.length === 0) {
      error.value = 'Quiz is enabled, but no questions have been added yet.';
      return;
    }
    for (let i = 0; i < form.quiz_questions.length; i++) {
      const q = form.quiz_questions[i];
      if (!q.question.trim()) {
        error.value = `Question #${i + 1} is empty. Please enter the question text or remove it.`;
        return;
      }
      const validOpts = q.options.filter((o) => o.trim());
      if (validOpts.length < 2) {
        error.value = `Question #${i + 1} must have at least 2 non-empty options.`;
        return;
      }
    }
  }

  const tags = form.tagsString
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const quizData = form.quiz_enabled
    ? {
        enabled: true,
        title: form.quiz_title.trim() || `${form.title.trim()} — Knowledge Check`,
        passing_score: Number(form.quiz_passing_score) || 70,
        questions: form.quiz_questions
          .map((q, idx) => ({
            id: q.id || `q_${idx + 1}`,
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()).filter(Boolean),
            correct_answer: Number(q.correct_answer || 0),
          }))
          .filter((q) => q.question && q.options.length >= 2),
      }
    : null;

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
    quiz_data: quizData,
  };

  saving.value = true;
  try {
    if (isEdit.value && blogId.value) {
      await apiPut(`/blogs/${blogId.value}`, payload);
      showNotice('Article updated and saved successfully!');
    } else {
      const res = await apiPost<BlogPost>('/blogs', payload);
      showNotice('Article published successfully!');
      // Navigate to the edit view of the newly created post
      if (res?.id) {
        router.replace({ path: `/d/blogs/${res.id}/edit` });
      } else {
        router.push({ path: '/d/blogs' });
      }
    }
  } catch (e: any) {
    error.value = errorMessage(e, 'Failed to save blog post');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadCategories();
  loadBlogData();
});
</script>

<template>
  <div class="mx-auto max-w-7xl pb-16">
    <!-- Top Bar / Breadcrumb & Header -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
      <div class="flex items-center gap-3">
        <RouterLink
          to="/d/blogs"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
        >
          <Icon name="arrow-left" :size="14" />
          <span>Back to Articles</span>
        </RouterLink>

        <div class="h-4 w-px bg-slate-300" />

        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-slate-900">
              {{ isEdit ? 'Edit Article' : 'Create New Article' }}
            </h1>
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
              :class="
                form.status === 'published'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : form.status === 'draft'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-600'
              "
            >
              {{ form.status.toUpperCase() }}
            </span>
          </div>
          <p class="text-xs text-slate-500 font-mono mt-0.5">
            {{ form.slug ? `/blog/${form.slug}` : 'Draft article' }}
          </p>
        </div>
      </div>

      <!-- Action Buttons in Header -->
      <div class="flex items-center gap-2.5">
        <a
          v-if="form.slug"
          :href="`/blog/${form.slug}`"
          target="_blank"
          class="btn-outline btn-sm inline-flex items-center gap-1.5 text-slate-700 hover:text-brand-600"
          title="Preview public article"
        >
          <Icon name="eye" :size="14" />
          <span>View Public</span>
          <Icon name="external-link" :size="12" class="opacity-60" />
        </a>

        <button
          type="button"
          class="btn-outline btn-sm text-slate-700"
          :disabled="saving"
          @click="savePost('draft')"
        >
          Save Draft
        </button>

        <button
          type="button"
          class="btn-primary btn-sm inline-flex items-center gap-1.5 px-4 shadow-sm"
          :disabled="saving"
          @click="savePost('published')"
        >
          <Icon v-if="saving" name="loader" :size="14" class="animate-spin" />
          <Icon v-else name="check" :size="14" />
          <span>{{ isEdit ? 'Save & Update' : 'Save & Publish' }}</span>
        </button>
      </div>
    </div>

    <!-- Alerts -->
    <div v-if="notice" class="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 flex items-center justify-between shadow-xs">
      <div class="flex items-center gap-2">
        <Icon name="check-circle" :size="18" class="text-emerald-600 shrink-0" />
        <span>{{ notice }}</span>
      </div>
      <button type="button" class="text-emerald-600 hover:text-emerald-800 text-xs" @click="notice = ''">✕</button>
    </div>

    <div v-if="error" class="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 flex items-center justify-between shadow-xs">
      <div class="flex items-center gap-2">
        <Icon name="alert-circle" :size="18" class="text-rose-600 shrink-0" />
        <span>{{ error }}</span>
      </div>
      <button type="button" class="text-rose-600 hover:text-rose-800 text-xs" @click="error = ''">✕</button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="card p-12 text-center text-slate-400">
      <Icon name="loader" :size="24" class="animate-spin mx-auto mb-2 text-brand-600" />
      <p class="text-sm">Loading article details...</p>
    </div>

    <!-- Editor Main 2-Column Form -->
    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- ── Left Column (Main Content & Quiz) ── -->
      <div class="space-y-6 lg:col-span-8">
        <!-- Article Core Card -->
        <div class="card p-6 space-y-5">
          <!-- Title Input -->
          <div>
            <label class="label text-xs font-bold uppercase tracking-wider text-slate-700">
              Article Title <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="form.title"
              type="text"
              class="input text-lg font-bold py-2.5 shadow-xs"
              placeholder="e.g. 10 Essential Workplace Fire Safety Protocols Every Industry Must Follow"
              @input="onTitleInput"
            />
          </div>

          <!-- Permalink / Slug -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-semibold text-slate-700">
                Permalink / URL Slug <span class="text-rose-500">*</span>
              </label>
              <button
                type="button"
                class="text-[11px] font-semibold text-brand-600 hover:underline"
                @click="slugAuto = !slugAuto; onTitleInput()"
              >
                {{ slugAuto ? 'Edit Manually' : 'Auto-Generate from Title' }}
              </button>
            </div>
            <div class="flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-xs focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
              <span class="font-mono text-slate-400 select-none">/blog/</span>
              <input
                v-model="form.slug"
                type="text"
                class="flex-1 bg-transparent font-mono font-medium outline-none text-slate-800"
                placeholder="article-slug"
              />
            </div>
          </div>

          <!-- Short Summary / Excerpt -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="label text-xs font-bold uppercase tracking-wider text-slate-700 mb-0">
                Short Summary / Excerpt (Optional)
              </label>
              <button
                type="button"
                class="text-[11px] font-semibold text-brand-600 hover:underline flex items-center gap-1"
                @click="summaryRichMode = !summaryRichMode"
              >
                <span>{{ summaryRichMode ? '← Simple Text Box' : '🛠️ Open Rich Text Editor' }}</span>
              </button>
            </div>
            <p class="text-xs text-slate-500 mb-2">
              A 1-2 sentence overview shown on blog cards and search engine snippets.
            </p>

            <div v-if="summaryRichMode" class="mt-1">
              <RichTextEditor v-model="form.summary" />
            </div>
            <div v-else class="mt-1">
              <textarea
                v-model="form.summary"
                rows="3"
                class="input text-xs leading-relaxed"
                placeholder="Write a clear, concise overview of this article to hook readers..."
              ></textarea>
            </div>
          </div>

          <!-- Main Article Body -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="label text-xs font-bold uppercase tracking-wider text-slate-700 mb-0">
                Article Body Content <span class="text-rose-500">*</span>
              </label>
              <span class="text-[11px] text-slate-400">
                Full rich-text formatting, headings, bullet lists & code blocks supported.
              </span>
            </div>
            <div class="min-h-[420px]">
              <RichTextEditor v-model="form.content" />
            </div>
          </div>
        </div>

        <!-- ── Interactive Quiz & Verified Certificate Card ── -->
        <div class="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <!-- Quiz Header & Toggle Switch -->
          <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div class="flex items-start gap-3.5">
              <div class="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-800 text-xl shrink-0 shadow-xs">
                🎓
              </div>
              <div>
                <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Knowledge Check Quiz & Participation Certificate</span>
                  <span
                    v-if="form.quiz_enabled"
                    class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800"
                  >
                    Active
                  </span>
                </h3>
                <p class="text-xs text-slate-600 mt-0.5 max-w-2xl leading-relaxed">
                  Readers who complete this article can take the interactive quiz. Scoring the required passing mark will automatically issue an official <strong>Certificate of Participation</strong> from <em>Himaya Prevention Private Limited</em> directly to their email with their name and organization!
                </p>
              </div>
            </div>

            <!-- Toggle Switch -->
            <label class="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" v-model="form.quiz_enabled" class="sr-only peer" />
              <div class="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <!-- Quiz Configuration & Question Builder -->
          <div v-if="form.quiz_enabled" class="mt-5 space-y-6">
            <!-- Quiz Metadata Settings -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div>
                <label class="label text-xs font-semibold text-slate-700">Quiz Title</label>
                <input
                  v-model="form.quiz_title"
                  type="text"
                  class="input text-xs bg-white"
                  placeholder="e.g. Workplace Safety Knowledge Assessment"
                />
              </div>
              <div>
                <label class="label text-xs font-semibold text-slate-700">Passing Score (%)</label>
                <div class="flex items-center gap-2">
                  <input
                    v-model.number="form.quiz_passing_score"
                    type="number"
                    min="1"
                    max="100"
                    class="input text-xs bg-white w-28"
                    placeholder="70"
                  />
                  <span class="text-xs text-slate-500">
                    (e.g. <strong>70%</strong> requires 4 out of 5, or 14 out of 20 correct)
                  </span>
                </div>
              </div>
            </div>

            <!-- Questions Section -->
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Questions List ({{ form.quiz_questions.length }})
                  </h4>
                  <p class="text-[11px] text-slate-400">
                    Each question requires at least 2 options. Select the green radio button for the correct answer.
                  </p>
                </div>
                <button
                  type="button"
                  class="btn-primary btn-sm inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                  @click="addQuizQuestion"
                >
                  <Icon name="plus" :size="14" />
                  <span>Add Question</span>
                </button>
              </div>

              <!-- Empty State -->
              <div
                v-if="form.quiz_questions.length === 0"
                class="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center bg-slate-50/50"
              >
                <div class="mx-auto grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
                  <Icon name="award" :size="20" />
                </div>
                <p class="text-sm font-semibold text-slate-700">No questions added yet</p>
                <p class="text-xs text-slate-400 mt-1 mb-4">Add questions so readers can test their knowledge and earn their certificate.</p>
                <button
                  type="button"
                  class="btn-outline btn-sm inline-flex items-center gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  @click="addQuizQuestion"
                >
                  <Icon name="plus" :size="14" />
                  <span>Create First Question</span>
                </button>
              </div>

              <!-- Question Cards -->
              <div
                v-for="(q, qIdx) in form.quiz_questions"
                :key="q.id || qIdx"
                class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3.5 transition hover:border-slate-300"
              >
                <!-- Question Header -->
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <span class="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                      {{ qIdx + 1 }}
                    </span>
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Question {{ qIdx + 1 }}
                    </span>
                  </div>

                  <button
                    type="button"
                    class="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded transition"
                    title="Delete Question"
                    @click="removeQuizQuestion(qIdx)"
                  >
                    <Icon name="trash" :size="13" />
                    <span>Delete</span>
                  </button>
                </div>

                <!-- Question Text -->
                <div>
                  <textarea
                    v-model="q.question"
                    rows="2"
                    class="input text-xs font-medium w-full"
                    :placeholder="'e.g. What is the primary purpose of a Lockout/Tagout (LOTO) procedure?'"
                  ></textarea>
                </div>

                <!-- Options List -->
                <div class="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 space-y-2.5">
                  <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>Answer Options</span>
                    <span class="text-slate-400 font-normal">Choose radio button for correct answer</span>
                  </div>

                  <div
                    v-for="(opt, optIdx) in q.options"
                    :key="optIdx"
                    class="flex items-center gap-2.5 rounded-lg border p-1.5 transition"
                    :class="
                      q.correct_answer === optIdx
                        ? 'border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-400'
                        : 'border-slate-200 bg-white'
                    "
                  >
                    <label class="flex items-center gap-1.5 pl-2 cursor-pointer" title="Mark as correct answer">
                      <input
                        type="radio"
                        :name="'correct_' + qIdx"
                        :value="optIdx"
                        v-model="q.correct_answer"
                        class="h-4 w-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span
                        v-if="q.correct_answer === optIdx"
                        class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase"
                      >
                        Correct
                      </span>
                    </label>

                    <input
                      v-model="q.options[optIdx]"
                      type="text"
                      class="input text-xs flex-1 border-0 bg-transparent py-1 shadow-none focus:ring-0"
                      :placeholder="'Option ' + (optIdx + 1) + ' text...'"
                    />

                    <button
                      v-if="q.options.length > 2"
                      type="button"
                      class="text-slate-400 hover:text-rose-500 text-xs px-2 py-1 rounded"
                      title="Remove Option"
                      @click="removeQuizOption(qIdx, optIdx)"
                    >
                      ✕
                    </button>
                  </div>

                  <div class="pt-1 flex items-center justify-between">
                    <button
                      v-if="q.options.length < 6"
                      type="button"
                      class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                      @click="addQuizOption(qIdx)"
                    >
                      <Icon name="plus" :size="12" />
                      <span>Add Option</span>
                    </button>
                    <span class="text-[11px] text-slate-400">
                      {{ q.options.length }} / 6 options
                    </span>
                  </div>
                </div>
              </div>

              <!-- Bottom Add Question Button -->
              <button
                type="button"
                class="w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 py-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100/60 transition flex items-center justify-center gap-2"
                @click="addQuizQuestion"
              >
                <Icon name="plus" :size="15" />
                <span>+ Add Another Question</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Right Column (Sidebar Settings) ── -->
      <div class="space-y-6 lg:col-span-4">
        <!-- Publish Action Card -->
        <div class="card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Publishing Settings
            </h3>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-bold"
              :class="
                form.status === 'published'
                  ? 'bg-emerald-100 text-emerald-800'
                  : form.status === 'draft'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
              "
            >
              {{ form.status.toUpperCase() }}
            </span>
          </div>

          <div>
            <label class="label text-xs font-semibold text-slate-700">Status</label>
            <select v-model="form.status" class="input text-xs font-semibold">
              <option value="published">🟢 Published (Live on Website)</option>
              <option value="draft">🟡 Draft (Hidden from Website)</option>
              <option value="archived">⚪ Archived</option>
            </select>
          </div>

          <!-- Metadata details if editing -->
          <div v-if="isEdit" class="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1.5 border border-slate-100">
            <div class="flex justify-between">
              <span class="text-slate-400">Total Views:</span>
              <strong class="text-slate-800">{{ postMeta.view_count }}</strong>
            </div>
            <div v-if="postMeta.created_at" class="flex justify-between">
              <span class="text-slate-400">Created:</span>
              <span>{{ fmtTanggal(postMeta.created_at) }}</span>
            </div>
            <div v-if="postMeta.updated_at" class="flex justify-between">
              <span class="text-slate-400">Last Updated:</span>
              <span>{{ fmtRelatif(postMeta.updated_at) }}</span>
            </div>
          </div>

          <!-- Primary Save / Publish Button -->
          <button
            type="button"
            class="btn-primary w-full py-2.5 font-bold shadow-sm flex items-center justify-center gap-2"
            :disabled="saving"
            @click="savePost()"
          >
            <Icon v-if="saving" name="loader" :size="16" class="animate-spin" />
            <Icon v-else name="check" :size="16" />
            <span>{{ isEdit ? 'Update Article' : 'Publish Article' }}</span>
          </button>

          <button
            type="button"
            class="btn-outline w-full text-xs text-slate-700"
            :disabled="saving"
            @click="savePost('draft')"
          >
            Save as Draft
          </button>
        </div>

        <!-- Organization Card (Category & Author) -->
        <div class="card p-5 space-y-4">
          <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-3">
            Organization & Byline
          </h3>

          <!-- Category -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="label text-xs font-semibold text-slate-700 mb-0">Category</label>
              <button
                type="button"
                class="text-[11px] font-semibold text-brand-600 hover:underline"
                @click="customCategoryMode = !customCategoryMode; if (!customCategoryMode && !form.category) form.category = 'Industrial Safety'"
              >
                {{ customCategoryMode ? '← Choose from list' : '+ Custom category' }}
              </button>
            </div>

            <div v-if="!customCategoryMode">
              <select class="input text-xs font-medium" :value="form.category" @change="onCategorySelectChange">
                <option v-for="cat in allCategories" :key="cat" :value="cat">{{ cat }}</option>
                <option value="__custom__">+ Enter Custom Category...</option>
              </select>
            </div>
            <div v-else>
              <input
                v-model="form.category"
                type="text"
                class="input text-xs font-medium"
                placeholder="e.g. Hazardous Materials"
                autofocus
              />
            </div>
          </div>

          <!-- Author Byline -->
          <div>
            <label class="label text-xs font-semibold text-slate-700">Author / Faculty Byline</label>
            <input
              v-model="form.author_name"
              type="text"
              class="input text-xs"
              placeholder="e.g. NFSI Faculty / Dr. Sharma"
            />
          </div>

          <!-- Tags -->
          <div>
            <label class="label text-xs font-semibold text-slate-700">Tags (comma-separated)</label>
            <input
              v-model="form.tagsString"
              type="text"
              class="input text-xs"
              placeholder="Safety, Fire Safety, OSHA, Training"
            />

            <!-- Suggested Quick Tags -->
            <div class="mt-2.5">
              <span class="text-[10px] uppercase font-bold text-slate-400 block mb-1">Suggested Tags:</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="st in SUGGESTED_TAGS"
                  :key="st"
                  type="button"
                  class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition"
                  @click="quickAddTag(st)"
                >
                  + {{ st }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Featured Cover Image Card -->
        <div class="card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Featured Cover Image
            </h3>
            <button
              v-if="form.cover_image_url"
              type="button"
              class="text-xs text-rose-500 hover:underline"
              @click="form.cover_image_url = ''"
            >
              Remove
            </button>
          </div>

          <!-- Image Preview Container -->
          <div class="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
            <img
              v-if="form.cover_image_url"
              :src="form.cover_image_url"
              :alt="form.title || 'Cover image'"
              class="h-full w-full object-cover"
            />
            <div v-else class="text-center p-4 text-slate-400">
              <Icon name="image" :size="32" class="mx-auto mb-1 opacity-50" />
              <p class="text-xs">No cover image selected</p>
            </div>
          </div>

          <!-- URL Input & Upload Button -->
          <div class="space-y-2">
            <label class="label text-xs font-semibold text-slate-700 mb-1">Image URL or Upload</label>
            <div class="flex items-center gap-2">
              <input
                v-model="form.cover_image_url"
                type="url"
                class="input text-xs flex-1"
                placeholder="https://... or upload from files"
              />
              <MediaUploadButton
                v-can="'content.create'"
                accept="image/*"
                label="Upload"
                @uploaded="onCoverUploaded"
              />
            </div>
          </div>
        </div>

        <!-- Social & Search Preview Card -->
        <div class="card p-5 space-y-3">
          <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-3 flex items-center gap-2">
            <Icon name="globe" :size="14" />
            <span>Search & Social Preview</span>
          </h3>

          <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
            <div class="text-[11px] text-slate-500 truncate font-mono">
              hsedx.nfsi.in &rsaquo; blog &rsaquo; {{ form.slug || 'article-slug' }}
            </div>
            <div class="text-xs font-bold text-blue-700 hover:underline line-clamp-2">
              {{ form.title || 'Article Title Preview' }}
            </div>
            <p class="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
              {{ form.summary || 'Summary description will appear here as snippet for search engines and social cards...' }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
