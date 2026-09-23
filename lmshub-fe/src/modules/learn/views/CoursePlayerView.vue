<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGet, apiGetFull, apiPost, apiPut, assetUrl, errorMessage } from '@/lib/api';
import { fmtAngka, fmtPersen, fmtRelatif, initialsOf } from '@/lib/format';
import { sanitizeHtml } from '@/lib/sanitize';
import Icon from '@/components/ui/Icon.vue';
import CourseReviews from '@/modules/catalog/components/CourseReviews.vue';

interface Lesson {
  id: string;
  judul: string;
  tipe?: string;
  durasi?: number;
  selesai?: boolean;
  terkunci?: boolean;
  drip_info?: string;
  video_url?: string;
  konten?: string;
  allow_download?: boolean;
}
interface Section {
  id?: string;
  judul: string;
  lessons?: Lesson[];
}
interface CourseCurriculum {
  id: string;
  judul: string;
  progress_percent?: number;
  sections?: Section[];
}
interface Note {
  id: string;
  isi: string;
  timestamp_detik?: number | null;
  created_at?: string;
}
interface QaAnswer {
  id: string;
  isi: string;
  penjawab_nama: string;
  is_instruktur_jawaban: boolean;
  jumlah_upvote: number;
}
interface QaQuestion {
  id: string;
  isi: string;
  penanya_nama?: string;
  penanya_foto?: string | null;
  status_terjawab: boolean;
  jumlah_upvote: number;
  jawaban?: QaAnswer[];
  created_at?: string;
}

const route = useRoute();
const { t } = useI18n();
const courseId = route.params.courseId as string;

const course = ref<CourseCurriculum | null>(null);
const loading = ref(true);
const error = ref('');
const sidebarOpen = ref(false);
const activeTab = ref<'catatan' | 'qa' | 'ulasan'>('catatan');

const currentLessonId = ref<string | null>(null);
const markingComplete = ref(false);

const notes = ref<Note[]>([]);
const newNoteText = ref('');
const notesLoading = ref(false);

const qa = ref<QaQuestion[]>([]);
const newQuestionText = ref('');
const qaLoading = ref(false);
const answerDraft = ref<Record<string, string>>({});

const videoEl = ref<HTMLVideoElement | null>(null);
let lastProgressSentAt = 0;

/** Video YouTube tidak bisa diputar <video> — deteksi & render sebagai iframe embed. */
function youtubeEmbed(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

const allLessons = computed<Lesson[]>(() => (course.value?.sections ?? []).flatMap((s) => s.lessons ?? []));
const currentLesson = computed<Lesson | null>(() => allLessons.value.find((l) => l.id === currentLessonId.value) ?? null);
const currentIndex = computed(() => allLessons.value.findIndex((l) => l.id === currentLessonId.value));
const nextLesson = computed<Lesson | null>(() => allLessons.value[currentIndex.value + 1] ?? null);

const progressPercent = computed(() => {
  if (typeof course.value?.progress_percent === 'number') return Math.round(course.value.progress_percent);
  const total = allLessons.value.length;
  if (!total) return 0;
  const done = allLessons.value.filter((l) => l.selesai).length;
  return Math.round((done / total) * 100);
});
const certificateEligible = computed(() => progressPercent.value >= 100);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    course.value = await apiGet<CourseCurriculum>(`/courses/${courseId}/learn`);
    const firstUnfinished = allLessons.value.find((l) => !l.selesai && !l.terkunci);
    currentLessonId.value = (firstUnfinished ?? allLessons.value[0])?.id ?? null;
    if (currentLessonId.value) await loadSidePanels(currentLessonId.value);
  } catch (e) {
    error.value = errorMessage(e, t('learn.player.notFound'));
  } finally {
    loading.value = false;
  }
}

async function loadSidePanels(lessonId: string) {
  notesLoading.value = true;
  qaLoading.value = true;
  try {
    notes.value = (await apiGetFull<Note[]>(`/lessons/${lessonId}/notes`).then((r) => r.data ?? []).catch(() => [])) as Note[];
  } finally {
    notesLoading.value = false;
  }
  try {
    qa.value = (await apiGetFull<QaQuestion[]>(`/discussions/lessons/${lessonId}/questions`).then((r) => r.data ?? []).catch(() => [])) as QaQuestion[];
  } finally {
    qaLoading.value = false;
  }
}

function selectLesson(lesson: Lesson) {
  if (lesson.terkunci) return;
  currentLessonId.value = lesson.id;
  sidebarOpen.value = false;
  loadSidePanels(lesson.id);
}

async function markComplete() {
  if (!currentLesson.value || currentLesson.value.selesai) return;
  markingComplete.value = true;
  try {
    await apiPut(`/lessons/${currentLesson.value.id}/progress`, { status: 'selesai' });
    currentLesson.value.selesai = true;
  } catch (e) {
    error.value = errorMessage(e, t('learn.player.markFailed'));
  } finally {
    markingComplete.value = false;
  }
}

function handleTimeUpdate() {
  const el = videoEl.value;
  if (!el || !currentLesson.value) return;
  const now = Date.now();
  if (now - lastProgressSentAt < 12000) return; // throttle ~12s
  lastProgressSentAt = now;
  apiPut(`/lessons/${currentLesson.value.id}/progress`, {
    status: 'sedang_dipelajari',
    positionSeconds: Math.floor(el.currentTime),
  }).catch(() => {});
}

async function handleEnded() {
  await markComplete();
  if (nextLesson.value && !nextLesson.value.terkunci) selectLesson(nextLesson.value);
}

// ── Catatan ──────────────────────────────────────────────
async function addNote() {
  if (!newNoteText.value.trim() || !currentLesson.value) return;
  try {
    await apiPost(`/lessons/${currentLesson.value.id}/notes`, {
      isi: newNoteText.value.trim(),
      timestamp_detik: videoEl.value ? Math.floor(videoEl.value.currentTime) : 0,
    });
    newNoteText.value = '';
    await loadSidePanels(currentLesson.value.id);
  } catch (e) {
    error.value = errorMessage(e, t('learn.player.noteSaveFailed'));
  }
}

async function deleteNote(id: string) {
  try {
    await apiDelete(`/notes/${id}`);
    notes.value = notes.value.filter((n) => n.id !== id);
  } catch (e) {
    error.value = errorMessage(e, t('learn.player.noteDeleteFailed'));
  }
}

function seekTo(seconds?: number | null) {
  if (videoEl.value && typeof seconds === 'number') {
    videoEl.value.currentTime = seconds;
    videoEl.value.play().catch(() => {});
  }
}

// ── Tanya-Jawab ──────────────────────────────────────────
async function askQuestion() {
  if (!newQuestionText.value.trim() || !currentLesson.value) return;
  try {
    await apiPost(`/discussions/lessons/${currentLesson.value.id}/questions`, { isi: newQuestionText.value.trim() });
    newQuestionText.value = '';
    await loadSidePanels(currentLesson.value.id);
  } catch (e) {
    error.value = errorMessage(e, t('learn.player.questionFailed'));
  }
}

async function sendAnswer(q: QaQuestion) {
  const isi = answerDraft.value[q.id];
  if (!isi?.trim()) return;
  try {
    await apiPost(`/discussions/questions/${q.id}/answers`, { isi: isi.trim() });
    answerDraft.value[q.id] = '';
    if (currentLesson.value) await loadSidePanels(currentLesson.value.id);
  } catch (e) {
    error.value = errorMessage(e, t('learn.player.answerFailed'));
  }
}

async function upvoteQuestion(q: QaQuestion) {
  q.jumlah_upvote = (q.jumlah_upvote ?? 0) + 1; // optimistic
  try {
    await apiPost(`/discussions/questions/${q.id}/upvote`);
  } catch {
    q.jumlah_upvote = Math.max(0, (q.jumlah_upvote ?? 1) - 1);
  }
}

const TABS = computed(() => [
  { k: 'catatan', label: t('learn.player.tabNotes'), n: notes.value.length },
  { k: 'qa', label: t('learn.player.tabQa'), n: qa.value.length },
  { k: 'ulasan', label: t('learn.player.tabReviews'), n: 0 },
]);

function fmtTime(s?: number | null) {
  if (typeof s !== 'number') return '00:00';
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

onMounted(load);
</script>

<template>
  <div>
    <div v-if="loading" class="text-slate-400">{{ t('learn.player.loading') }}</div>
    <div v-else-if="error" class="card p-6 text-slate-500">
      {{ error }}
      <RouterLink to="/d/belajar" class="mt-2 block font-medium text-brand-500">{{ t('learn.player.back') }}</RouterLink>
    </div>

    <div v-else-if="course" class="grid gap-4 lg:grid-cols-[20rem,1fr]">
      <!-- Sidebar kurikulum -->
      <button class="btn-outline mb-1 w-full lg:hidden" @click="sidebarOpen = !sidebarOpen">
        {{ sidebarOpen ? t('learn.player.closeCurriculum') : t('learn.player.openCurriculum') }}
      </button>
      <aside class="card max-h-[32rem] overflow-y-auto p-3" :class="sidebarOpen ? 'block' : 'hidden lg:block'">
        <h2 class="mb-2 px-1 text-lg font-medium text-slate-900">{{ course.judul }}</h2>
        <div v-for="(s, si) in course.sections || []" :key="si" class="mb-2">
          <div class="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ s.judul }}</div>
          <button
            v-for="l in s.lessons || []"
            :key="l.id"
            class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-sm transition"
            :class="[
              l.id === currentLessonId ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50 text-slate-700',
              l.terkunci ? 'cursor-not-allowed opacity-50' : '',
            ]"
            :disabled="l.terkunci"
            :title="l.terkunci ? l.drip_info || t('learn.player.locked') : ''"
            @click="selectLesson(l)"
          >
            <span>{{ l.terkunci ? '🔒' : l.selesai ? '✅' : l.id === currentLessonId ? '▶' : '○' }}</span>
            <span class="flex-1 truncate">{{ l.judul }}</span>
            <span v-if="l.durasi" class="text-xs text-slate-400">{{ fmtAngka(l.durasi) }}{{ t('learn.player.minShort') }}</span>
          </button>
        </div>
      </aside>

      <!-- Konten utama -->
      <div>
        <div v-if="certificateEligible" class="card mb-4 flex flex-wrap items-center justify-between gap-3 border-accent-500/40 bg-accent-500/5 p-4">
          <div>
            <div class="font-medium text-accent-600">{{ t('learn.player.congratsTitle') }}</div>
            <p class="text-sm text-slate-500">{{ t('learn.player.congratsText') }}</p>
          </div>
          <div class="flex gap-2">
            <button class="btn-outline" @click="activeTab = 'ulasan'">{{ t('learn.player.writeReview') }}</button>
            <RouterLink to="/d/sertifikat" class="btn-primary bg-accent-500 hover:bg-accent-600">
              {{ t('learn.player.viewCertificate') }}
            </RouterLink>
          </div>
        </div>

        <div v-if="currentLesson" class="card p-4">
          <h1 class="text-xl font-medium text-slate-900">{{ currentLesson.judul }}</h1>

          <div v-if="!currentLesson.tipe || currentLesson.tipe === 'video'" class="mt-3 overflow-hidden rounded-lg bg-black">
            <iframe
              v-if="youtubeEmbed(currentLesson.video_url)"
              :key="currentLesson.id"
              :src="youtubeEmbed(currentLesson.video_url)!"
              class="aspect-video w-full"
              :title="t('learn.player.videoTitle')"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
            <!-- assetUrl(): berkas video yang diunggah tersimpan sebagai path
                 relatif (/uploads/...). Tanpa ini path tersebut dicari di origin
                 frontend, padahal yang menyajikannya adalah API — pemasangan
                 dengan domain terpisah (lms.example.com + api.example.com) akan
                 selalu gagal memutar video milik pembeli sendiri. -->
            <video
              v-else
              ref="videoEl"
              class="aspect-video w-full"
              controls
              :src="assetUrl(currentLesson.video_url)"
              @timeupdate="handleTimeUpdate"
              @ended="handleEnded"
            >
              {{ t('learn.player.noVideoSupport') }}
            </video>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -- isi dilewatkan sanitizeHtml() lebih dulu; lihat src/lib/sanitize.ts -->
          <div v-else-if="currentLesson.tipe === 'teks'" class="prose mt-3 max-w-none text-sm text-slate-700" v-html="sanitizeHtml(currentLesson.konten)"></div>
          <div v-else class="mt-3 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
            {{ t('learn.player.otherType', { type: currentLesson.tipe }) }}
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <button class="btn-primary" :disabled="currentLesson.selesai || markingComplete" @click="markComplete">
              {{
                currentLesson.selesai
                  ? t('learn.player.done')
                  : markingComplete
                    ? t('common.state.saving')
                    : t('learn.player.markDone')
              }}
            </button>
            <a v-if="currentLesson.allow_download" :href="`/api/v1/lessons/${currentLesson.id}/materials`" class="btn-outline" target="_blank" rel="noopener">
              {{ t('learn.player.downloadMaterial') }}
            </a>
          </div>

          <div class="mt-4">
            <div class="flex items-center justify-between text-xs text-slate-500">
              <span>{{ t('learn.player.courseProgress') }}</span>
              <span>{{ fmtPersen(progressPercent) }}</span>
            </div>
            <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-brand-500" :style="{ width: `${progressPercent}%` }"></div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">{{ t('learn.player.noLessons') }}</div>

        <!-- Tabs bawah: Catatan / Tanya-Jawab / Ulasan -->
        <div class="card mt-4">
          <div class="tab-bar px-2">
            <button
              v-for="tab in TABS"
              :key="tab.k"
              class="tab-item flex items-center gap-1.5"
              :class="{ 'tab-item-active': activeTab === tab.k }"
              @click="activeTab = tab.k as typeof activeTab"
            >
              {{ tab.label }}
              <span v-if="tab.n" class="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{{ fmtAngka(tab.n) }}</span>
            </button>
          </div>

          <!-- CATATAN -->
          <div v-if="activeTab === 'catatan'" class="p-4">
            <div class="mb-4 flex gap-2">
              <div class="flex flex-1 items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 focus-within:border-brand-400">
                <span class="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-600">
                  {{ videoEl ? fmtTime(Math.floor(videoEl.currentTime || 0)) : '00:00' }}
                </span>
                <input
                  v-model="newNoteText"
                  class="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                  :placeholder="t('learn.player.notePlaceholder')"
                  @keyup.enter="addNote"
                />
              </div>
              <button class="btn-primary shrink-0" @click="addNote">
                <Icon name="plus" :size="16" /> {{ t('learn.player.noteBtn') }}
              </button>
            </div>

            <div v-if="notesLoading" class="text-sm text-slate-400">{{ t('learn.player.notesLoading') }}</div>
            <ul v-else-if="notes.length" class="space-y-2">
              <li v-for="n in notes" :key="n.id" class="group flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <button
                  class="shrink-0 rounded bg-brand-500 px-2 py-0.5 font-mono text-[11px] font-medium text-white transition hover:bg-brand-600"
                  :title="t('learn.player.jumpTo')"
                  @click="seekTo(n.timestamp_detik)"
                >
                  {{ fmtTime(n.timestamp_detik) }}
                </button>
                <span class="flex-1 text-sm text-slate-700">{{ n.isi }}</span>
                <button
                  class="shrink-0 text-slate-300 opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                  :title="t('common.action.delete')"
                  @click="deleteNote(n.id)"
                >
                  <Icon name="x" :size="15" />
                </button>
              </li>
            </ul>
            <div v-else class="empty-inline">
              {{ t('learn.player.notesEmpty') }}
            </div>
          </div>

          <!-- TANYA-JAWAB -->
          <div v-else-if="activeTab === 'qa'" class="p-4">
            <div class="mb-4 flex gap-2">
              <input
                v-model="newQuestionText"
                class="input"
                :placeholder="t('learn.player.qaPlaceholder')"
                @keyup.enter="askQuestion"
              />
              <button class="btn-primary shrink-0" @click="askQuestion">{{ t('learn.player.ask') }}</button>
            </div>

            <div v-if="qaLoading" class="text-sm text-slate-400">{{ t('learn.player.qaLoading') }}</div>
            <ul v-else-if="qa.length" class="space-y-3">
              <li v-for="q in qa" :key="q.id" class="rounded-lg border border-slate-100 p-3">
                <!-- Pertanyaan -->
                <div class="flex items-start gap-3">
                  <span class="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500 text-xs font-bold text-white">
                    <img v-if="q.penanya_foto" :src="assetUrl(q.penanya_foto)" :alt="q.penanya_nama" class="h-full w-full object-cover" />
                    <template v-else>{{ initialsOf(q.penanya_nama) }}</template>
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-slate-800">{{ q.penanya_nama || t('learn.player.student') }}</span>
                      <span class="text-xs text-slate-400">{{ fmtRelatif(q.created_at) }}</span>
                      <span
                        class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        :class="q.status_terjawab ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
                      >
                        {{ q.status_terjawab ? t('learn.player.answered') : t('learn.player.waiting') }}
                      </span>
                    </div>
                    <p class="mt-0.5 text-sm text-slate-700">{{ q.isi }}</p>
                    <button class="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-brand-500" @click="upvoteQuestion(q)">
                      {{ t('learn.player.helpful', { n: fmtAngka(q.jumlah_upvote ?? 0) }) }}
                    </button>
                  </div>
                </div>

                <!-- Jawaban -->
                <div v-if="q.jawaban?.length" class="ms-11 mt-2 space-y-2 border-s-2 border-slate-100 ps-3">
                  <div v-for="a in q.jawaban" :key="a.id" class="text-sm">
                    <span class="font-medium text-slate-700">{{ a.penjawab_nama }}</span>
                    <span v-if="a.is_instruktur_jawaban" class="ms-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                      {{ t('learn.player.instructor') }}
                    </span>
                    <p class="text-slate-600">{{ a.isi }}</p>
                  </div>
                </div>

                <!-- Balas -->
                <div class="ms-11 mt-2 flex gap-2">
                  <input
                    v-model="answerDraft[q.id]"
                    class="input py-1.5 text-sm"
                    :placeholder="t('learn.player.answerPlaceholder')"
                    @keyup.enter="sendAnswer(q)"
                  />
                  <button class="btn-outline btn-sm shrink-0" @click="sendAnswer(q)">{{ t('common.action.send') }}</button>
                </div>
              </li>
            </ul>
            <div v-else class="empty-inline">
              {{ t('learn.player.qaEmpty') }}
            </div>
          </div>

          <!-- ULASAN -->
          <div v-else class="p-4">
            <CourseReviews :course-id="courseId" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
