<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPost, assetUrl, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { fmtAngka, fmtRelatif, initialsOf } from '@/lib/format';
import PageHeader from '@/components/ui/PageHeader.vue';
import Icon from '@/components/ui/Icon.vue';

interface CourseOpt { id: string; judul: string }
interface LessonOpt { id: string; judul: string; section: string }
interface Thread {
  id: string;
  judul: string;
  penulis_nama?: string;
  penulis_foto?: string | null;
  jumlah_post?: number;
  is_pinned?: boolean;
  created_at?: string;
}
interface Post { id: string; isi: string; penulis_nama?: string; penulis_foto?: string | null; created_at?: string }
interface ThreadDetail extends Thread { posts?: Post[] }
interface Answer { id: string; isi: string; penjawab_nama: string; is_instruktur_jawaban: boolean }
interface Question {
  id: string;
  isi: string;
  penanya_nama?: string;
  penanya_foto?: string | null;
  status_terjawab: boolean;
  jumlah_upvote: number;
  jawaban?: Answer[];
  created_at?: string;
}

const auth = useAuthStore();
const { t } = useI18n();
const tab = ref<'forum' | 'qa'>('forum');

// ── Pilihan kursus (dropdown, gabungan enrollment siswa + kursus instruktur) ──
const courses = ref<CourseOpt[]>([]);
const selectedCourse = ref('');

async function loadCourses() {
  const map = new Map<string, string>();
  // Kursus yang diikuti (siswa) — sumber utama.
  const enr = await apiGetFull<Array<{ course_id: string; kursus_judul: string; status: string }>>('/enrollments', { limit: 100 })
    .then((r) => r.data ?? [])
    .catch(() => []);
  for (const e of enr) if (['terdaftar', 'aktif', 'selesai'].includes(e.status)) map.set(e.course_id, e.kursus_judul);
  // Kursus yang dikelola (instruktur/admin).
  if (auth.can('kursus.create')) {
    const mine = await apiGetFull<Array<{ id: string; judul: string }>>('/courses', { limit: 100 })
      .then((r) => r.data ?? [])
      .catch(() => []);
    for (const c of mine) map.set(c.id, c.judul);
  }
  courses.value = [...map.entries()].map(([id, judul]) => ({ id, judul }));
  if (!selectedCourse.value && courses.value.length) selectedCourse.value = courses.value[0].id;
}

// ── Forum ──
const threads = ref<Thread[]>([]);
const threadsLoading = ref(false);
const threadsError = ref('');
const showNewThread = ref(false);
const newThreadTitle = ref('');
const newThreadBody = ref('');
const activeThread = ref<ThreadDetail | null>(null);
const replyBody = ref('');

async function loadThreads() {
  if (!selectedCourse.value) {
    threads.value = [];
    return;
  }
  threadsLoading.value = true;
  threadsError.value = '';
  activeThread.value = null;
  try {
    const res = await apiGetFull<Thread[]>(`/discussions/courses/${selectedCourse.value}/threads`);
    threads.value = res.data ?? [];
  } catch (e) {
    threadsError.value = errorMessage(e, t('discussions.forum.loadFailed'));
  } finally {
    threadsLoading.value = false;
  }
}

async function openThread(id: string) {
  try {
    activeThread.value = await apiGet<ThreadDetail>(`/discussions/threads/${id}`);
  } catch (e) {
    threadsError.value = errorMessage(e, t('discussions.forum.threadFailed'));
  }
}

async function createThread() {
  if (!newThreadTitle.value.trim() || !selectedCourse.value) return;
  try {
    await apiPost(`/discussions/courses/${selectedCourse.value}/threads`, {
      judul: newThreadTitle.value.trim(),
      isi: newThreadBody.value.trim() || undefined,
    });
    newThreadTitle.value = '';
    newThreadBody.value = '';
    showNewThread.value = false;
    await loadThreads();
  } catch (e) {
    threadsError.value = errorMessage(e, t('discussions.forum.createFailed'));
  }
}

async function sendReply() {
  if (!activeThread.value || !replyBody.value.trim()) return;
  try {
    await apiPost(`/discussions/threads/${activeThread.value.id}/posts`, { isi: replyBody.value.trim() });
    replyBody.value = '';
    await openThread(activeThread.value.id);
  } catch (e) {
    threadsError.value = errorMessage(e, t('discussions.forum.replyFailed'));
  }
}

// ── Q&A per pelajaran ──
const lessons = ref<LessonOpt[]>([]);
const selectedLesson = ref('');
const questions = ref<Question[]>([]);
const qaLoading = ref(false);
const qaError = ref('');
const newQuestion = ref('');
const answerDraft = ref<Record<string, string>>({});

async function loadLessons() {
  lessons.value = [];
  selectedLesson.value = '';
  if (!selectedCourse.value) return;
  try {
    const data = await apiGet<{ sections?: Array<{ judul: string; lessons?: Array<{ id: string; judul: string }> }> }>(
      `/courses/${selectedCourse.value}/learn`,
    );
    lessons.value = (data.sections ?? []).flatMap((s) =>
      (s.lessons ?? []).map((l) => ({ id: l.id, judul: l.judul, section: s.judul })),
    );
    if (lessons.value.length) selectedLesson.value = lessons.value[0].id;
  } catch {
    lessons.value = [];
  }
}

async function loadQa() {
  if (!selectedLesson.value) {
    questions.value = [];
    return;
  }
  qaLoading.value = true;
  qaError.value = '';
  try {
    const res = await apiGetFull<Question[]>(`/discussions/lessons/${selectedLesson.value}/questions`);
    questions.value = res.data ?? [];
  } catch (e) {
    qaError.value = errorMessage(e, t('discussions.qa.loadFailed'));
  } finally {
    qaLoading.value = false;
  }
}

async function askQuestion() {
  if (!newQuestion.value.trim() || !selectedLesson.value) return;
  try {
    await apiPost(`/discussions/lessons/${selectedLesson.value}/questions`, { isi: newQuestion.value.trim() });
    newQuestion.value = '';
    await loadQa();
  } catch (e) {
    qaError.value = errorMessage(e, t('discussions.qa.askFailed'));
  }
}

async function sendAnswer(q: Question) {
  const isi = answerDraft.value[q.id];
  if (!isi?.trim()) return;
  try {
    await apiPost(`/discussions/questions/${q.id}/answers`, { isi: isi.trim() });
    answerDraft.value[q.id] = '';
    await loadQa();
  } catch (e) {
    qaError.value = errorMessage(e, t('discussions.qa.answerFailed'));
  }
}

async function upvote(q: Question) {
  q.jumlah_upvote = (q.jumlah_upvote ?? 0) + 1;
  try {
    await apiPost(`/discussions/questions/${q.id}/upvote`);
  } catch {
    q.jumlah_upvote = Math.max(0, (q.jumlah_upvote ?? 1) - 1);
  }
}

// Saat kursus berganti, muat ulang thread & pelajaran.
watch(selectedCourse, () => {
  loadThreads();
  loadLessons().then(loadQa);
});
watch(selectedLesson, loadQa);

// Saat belum ada satu topik pun, tata letak dua kolom tidak masuk akal: panel
// kanan mengajak "pilih topik di kiri" padahal tidak ada yang bisa dipilih,
// dan kolom kiri jadi kartu kerdil di sebelah panel tinggi yang kosong.
const forumKosong = computed(
  () => !threadsLoading.value && !threadsError.value && !threads.value.length && !showNewThread.value,
);

onMounted(async () => {
  await loadCourses();
  await Promise.all([loadThreads(), loadLessons().then(loadQa)]);
});
</script>

<template>
  <div>
    <PageHeader :title="t('discussions.title')" :subtitle="t('discussions.subtitle')">
      <template #actions>
        <RouterLink v-can="'diskusi.delete'" to="/d/diskusi/moderasi" class="btn-outline">
          {{ t('discussions.moderation') }}
        </RouterLink>
        <button
          v-if="tab === 'forum' && courses.length"
          v-can="'diskusi.create'"
          class="btn-primary"
          @click="showNewThread = !showNewThread"
        >
          <Icon name="plus" :size="16" /> {{ t('discussions.forum.newTopic') }}
        </button>
      </template>
    </PageHeader>

    <!-- Tab memakai pola yang sama dengan halaman bertab lain; sebelumnya
         halaman ini memakai segmented control sendiri di ujung kanan. -->
    <div class="tab-bar mb-4">
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'forum' }" @click="tab = 'forum'">
        {{ t('discussions.tabForum') }}
      </button>
      <button class="tab-item" :class="{ 'tab-item-active': tab === 'qa' }" @click="tab = 'qa'">
        {{ t('discussions.tabQa') }}
      </button>
    </div>

    <!-- Toolbar: pemilih kursus (dan materi saat tab Q&A) dalam satu kartu.
         Ikon berada di dalam field lewat `.input-icon-wrap`, bukan melayang
         di sebelahnya. -->
    <div v-if="courses.length" class="card mb-4 flex flex-wrap items-end gap-3 p-4">
      <div class="min-w-[16rem] flex-1 sm:max-w-xs">
        <label class="label">{{ t('discussions.courseLabel') }}</label>
        <div class="input-icon-wrap py-2">
          <Icon name="book-open" :size="16" />
          <select v-model="selectedCourse">
            <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.judul }}</option>
          </select>
        </div>
      </div>
      <div v-if="tab === 'qa'" class="min-w-[16rem] flex-1 sm:max-w-sm">
        <label class="label">{{ t('discussions.lessonLabel') }}</label>
        <div class="input-icon-wrap py-2">
          <Icon name="play-circle" :size="16" />
          <select v-model="selectedLesson">
            <option v-if="!lessons.length" value="">{{ t('discussions.qa.noLessons') }}</option>
            <optgroup v-for="grp in [...new Set(lessons.map((l) => l.section))]" :key="grp" :label="grp">
              <option v-for="l in lessons.filter((x) => x.section === grp)" :key="l.id" :value="l.id">{{ l.judul }}</option>
            </optgroup>
          </select>
        </div>
      </div>
    </div>

    <div v-if="!courses.length" class="empty-state">
      {{ t('discussions.noEnrollment') }}
      <RouterLink to="/d/katalog" class="mt-1 block font-medium text-brand-500">{{ t('discussions.browseCatalog') }}</RouterLink>
    </div>

    <!-- FORUM -->
    <template v-else-if="tab === 'forum'">
      <div v-if="forumKosong" class="empty-state">{{ t('discussions.forum.empty') }}</div>

      <div v-else class="grid gap-6 md:grid-cols-[22rem,1fr]">
      <div>
        <h3 class="card-title mb-3">{{ t('discussions.forum.topics') }}</h3>

        <div v-if="showNewThread" class="card mb-3 space-y-2 p-3">
          <input v-model="newThreadTitle" class="input" :placeholder="t('discussions.forum.titlePlaceholder')" />
          <textarea v-model="newThreadBody" class="input" rows="2" :placeholder="t('discussions.forum.bodyPlaceholder')"></textarea>
          <div class="flex gap-2">
            <button class="btn-primary flex-1 py-1.5 text-sm" @click="createThread">{{ t('common.action.send') }}</button>
            <button class="btn-outline py-1.5 text-sm" @click="showNewThread = false">{{ t('common.action.cancel') }}</button>
          </div>
        </div>

        <div v-if="threadsLoading" class="text-slate-400">{{ t('common.state.loading') }}</div>
        <p v-else-if="threadsError" class="alert-error">{{ threadsError }}</p>
        <p v-else-if="!threads.length" class="empty-state">{{ t('discussions.forum.empty') }}</p>
        <div v-else class="space-y-2">
          <button
            v-for="thread in threads"
            :key="thread.id"
            class="card block w-full p-3 text-start transition hover:shadow-md"
            :class="activeThread?.id === thread.id ? 'ring-1 ring-brand-300' : ''"
            @click="openThread(thread.id)"
          >
            <div class="flex items-center gap-2">
              <span v-if="thread.is_pinned" :title="t('discussions.forum.pinned')">📌</span>
              <span class="line-clamp-1 font-medium text-slate-800">{{ thread.judul }}</span>
            </div>
            <div class="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
              <span>{{ thread.penulis_nama || '—' }}</span>
              <span>·</span>
              <span>{{ fmtRelatif(thread.created_at) }}</span>
              <span class="ms-auto flex items-center gap-1">
                <Icon name="message-circle" :size="12" /> {{ fmtAngka(thread.jumlah_post ?? 0) }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div>
        <div v-if="!activeThread" class="card grid h-full min-h-[16rem] place-items-center p-6 text-center text-slate-400">
          <div>
            <Icon name="message-circle" :size="36" class="mx-auto text-slate-300" />
            <p class="mt-2">{{ t('discussions.forum.pickThread') }}</p>
          </div>
        </div>
        <div v-else class="card p-5">
          <h2 class="text-xl font-medium text-slate-900">{{ activeThread.judul }}</h2>
          <div class="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            <span>{{ activeThread.penulis_nama || '—' }}</span><span>·</span><span>{{ fmtRelatif(activeThread.created_at) }}</span>
          </div>

          <div class="mt-4 space-y-3">
            <div v-for="p in activeThread.posts || []" :key="p.id" class="flex items-start gap-3">
              <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500 text-xs font-bold text-white">
                <img v-if="p.penulis_foto" :src="assetUrl(p.penulis_foto)" :alt="p.penulis_nama" class="h-full w-full object-cover" />
                <template v-else>{{ initialsOf(p.penulis_nama) }}</template>
              </span>
              <div class="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-slate-700">{{ p.penulis_nama || '—' }}</span>
                  <span class="text-xs text-slate-400">{{ fmtRelatif(p.created_at) }}</span>
                </div>
                <p class="mt-0.5 text-sm text-slate-700">{{ p.isi }}</p>
              </div>
            </div>
            <p v-if="!activeThread.posts?.length" class="text-sm text-slate-400">{{ t('discussions.forum.noReplies') }}</p>
          </div>

          <div v-can="'diskusi.create'" class="mt-4 flex gap-2">
            <input v-model="replyBody" class="input" :placeholder="t('discussions.forum.replyPlaceholder')" @keyup.enter="sendReply" />
            <button class="btn-primary shrink-0" @click="sendReply">{{ t('discussions.forum.reply') }}</button>
          </div>
        </div>
        </div>
      </div>
    </template>

    <!-- Q&A -->
    <div v-else>
      <div v-can="'diskusi.create'" class="card mb-4 flex gap-2 p-4">
        <input
          v-model="newQuestion"
          class="input"
          :disabled="!selectedLesson"
          :placeholder="t('discussions.qa.askPlaceholder')"
          @keyup.enter="askQuestion"
        />
        <button class="btn-primary shrink-0" :disabled="!selectedLesson" @click="askQuestion">
          {{ t('discussions.qa.ask') }}
        </button>
      </div>

      <div v-if="qaLoading" class="text-slate-400">{{ t('discussions.qa.loading') }}</div>
      <p v-else-if="qaError" class="alert-error">{{ qaError }}</p>
      <p v-else-if="!questions.length" class="empty-state">{{ t('discussions.qa.empty') }}</p>
      <div v-else class="space-y-3">
        <div v-for="q in questions" :key="q.id" class="card p-4">
          <div class="flex items-start gap-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500 text-xs font-bold text-white">
              <img v-if="q.penanya_foto" :src="assetUrl(q.penanya_foto)" :alt="q.penanya_nama" class="h-full w-full object-cover" />
              <template v-else>{{ initialsOf(q.penanya_nama) }}</template>
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium text-slate-800">{{ q.penanya_nama || t('discussions.qa.student') }}</span>
                <span class="text-xs text-slate-400">{{ fmtRelatif(q.created_at) }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="q.status_terjawab ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
                >
                  {{ q.status_terjawab ? t('discussions.qa.answered') : t('discussions.qa.waiting') }}
                </span>
              </div>
              <p class="mt-0.5 text-sm text-slate-700">{{ q.isi }}</p>
              <button class="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-brand-500" @click="upvote(q)">
                {{ t('discussions.qa.helpful', { n: fmtAngka(q.jumlah_upvote ?? 0) }) }}
              </button>
            </div>
          </div>

          <div v-if="q.jawaban?.length" class="ms-12 mt-2 space-y-2 border-s-2 border-slate-100 ps-3">
            <div v-for="a in q.jawaban" :key="a.id" class="text-sm">
              <span class="font-medium text-slate-700">{{ a.penjawab_nama }}</span>
              <span v-if="a.is_instruktur_jawaban" class="ms-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                {{ t('discussions.qa.instructor') }}
              </span>
              <p class="text-slate-600">{{ a.isi }}</p>
            </div>
          </div>

          <div v-can="'diskusi.create'" class="ms-12 mt-2 flex gap-2">
            <input
              v-model="answerDraft[q.id]"
              class="input py-1.5 text-sm"
              :placeholder="t('discussions.qa.answerPlaceholder')"
              @keyup.enter="sendAnswer(q)"
            />
            <button class="btn-outline btn-sm shrink-0" @click="sendAnswer(q)">{{ t('discussions.qa.answer') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
