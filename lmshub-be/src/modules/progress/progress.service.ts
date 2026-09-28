import { AppError } from '../../core/http/AppError';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './progress.repository';
import * as enrollmentsRepo from '../enrollments/enrollments.repository';
import { CreateBookmarkInput, CreateNoteInput, UpdateLessonProgressInput, UpdateNoteInput } from './progress.validation';

const PERSEN_SELESAI_PENUH = 100;

const isSuper = (actor: AuthContext) => actor.permissions.has('*');

/** Cari enrollment siswa yang masih punya akses (terdaftar/aktif) untuk sebuah kursus. */
async function requireOwnEnrollment(actor: AuthContext, courseId: string) {
  const e = await enrollmentsRepo.findActiveByUserCourse(actor.userId, courseId);
  if (!e || !['terdaftar', 'aktif'].includes(e.status)) {
    throw AppError.forbidden('You do not have active access to this course', 'course.no_active_access');
  }
  if (e.akses_kedaluwarsa_at && new Date(e.akses_kedaluwarsa_at) < new Date()) {
    throw AppError.forbidden('Your access to this course has expired', 'course.access_expired');
  }
  return e;
}

async function recalcCourseProgress(enrollmentId: string, courseId: string) {
  const { wajib } = await repo.countCourseLessons(courseId);
  const selesai = await repo.countCompletedWajibLessons(enrollmentId, courseId);
  const persen = wajib > 0 ? Math.min(100, Math.round((selesai / wajib) * 10000) / 100) : 0;
  const completed = wajib > 0 && selesai >= wajib;

  const cp = await repo.upsertCourseProgress({
    enrollment_id: enrollmentId,
    persen_selesai: persen,
    jumlah_lesson_selesai: selesai,
    total_lesson: wajib,
    completed,
  });

  if (completed && persen >= PERSEN_SELESAI_PENUH) {
    // Sertifikat tidak diterbitkan di sini. Kelayakan dievaluasi saat siswa
    // mengklaim (POST /enrollments/:id/certificate/claim), karena syaratnya
    // menggabungkan progres, nilai, dan kehadiran — dua di antaranya bisa
    // berubah setelah pelajaran terakhir ditandai selesai.
    await enrollmentsRepo.markSelesai(enrollmentId);
  }
  return cp;
}

export async function updateLessonProgress(actor: AuthContext, lessonId: string, input: UpdateLessonProgressInput) {
  const lesson = await repo.lessonCourseId(lessonId);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const enrollment = await requireOwnEnrollment(actor, lesson.course_id);

  // Buka pelajaran pertama → Terdaftar menjadi Aktif (state machine enrollment, lihat modul 05).
  await enrollmentsRepo.activateIfTerdaftar(enrollment.id);

  const existing = await repo.findLessonProgress(enrollment.id, lessonId);
  const status = input.status ?? existing?.status ?? 'sedang';
  const posisi = input.posisi_detik ?? existing?.posisi_detik ?? 0;

  const lp = await repo.upsertLessonProgress({
    enrollment_id: enrollment.id,
    lesson_id: lessonId,
    status,
    posisi_detik: posisi,
  });

  const courseProgress = await recalcCourseProgress(enrollment.id, lesson.course_id);
  return { lesson_progress: lp, course_progress: courseProgress };
}

/**
 * Tampilan belajar untuk siswa ter-enroll: kurikulum lengkap + status progres tiap lesson.
 * Berbeda dari GET /courses/:id (manajemen) — endpoint ini di-scope ke enrollment milik sendiri
 * dan tetap bisa diakses setelah kursus selesai (review materi).
 */
export async function learnView(actor: AuthContext, courseId: string) {
  const course = await repo.learnCourse(courseId);
  if (!course) throw AppError.notFound('Course not found', 'course.not_found');

  const enrollment = await enrollmentsRepo.findActiveByUserCourse(actor.userId, courseId);
  const terdaftar = !!enrollment && ['terdaftar', 'aktif', 'selesai'].includes(enrollment.status);

  // Super admin dan instruktur pengampu boleh membuka isi kursus tanpa menjadi
  // siswa. Tanpa jalan ini, tab Tanya-Jawab mati total bagi mereka: daftar
  // materi tidak pernah termuat, sehingga tidak ada yang bisa dimoderasi.
  // Mereka melihat struktur kursus dengan progres nol — bukan progres siapa pun.
  const staf = terdaftar ? false : isSuper(actor) || (await repo.isCourseInstructor(courseId, actor.userId));

  if (!terdaftar && !staf) {
    throw AppError.forbidden('You are not enrolled in this course', 'enrollment.not_enrolled_course');
  }
  if (
    terdaftar &&
    enrollment!.status !== 'selesai' &&
    enrollment!.akses_kedaluwarsa_at &&
    new Date(enrollment!.akses_kedaluwarsa_at) < new Date()
  ) {
    throw AppError.forbidden('Your access to this course has expired', 'course.access_expired');
  }

  const [sections, lessons, lessonProgress, courseProgress] = await Promise.all([
    repo.learnSections(courseId),
    repo.learnLessons(courseId),
    enrollment ? repo.lessonProgressOfEnrollment(enrollment.id) : Promise.resolve([]),
    enrollment ? repo.getCourseProgress(enrollment.id) : Promise.resolve(null),
  ]);

  const progressByLesson = new Map(lessonProgress.map((lp) => [lp.lesson_id, lp]));
  const now = new Date();

  const sectionsOut = sections.map((s) => ({
    id: s.id,
    judul: s.judul,
    lessons: lessons
      .filter((l) => l.section_id === s.id)
      .map((l) => {
        const lp = progressByLesson.get(l.id);
        const terkunci = !!l.drip_release_at && new Date(l.drip_release_at) > now;
        return {
          id: l.id,
          judul: l.judul,
          tipe: l.tipe,
          durasi: l.durasi_menit,
          wajib_selesai: l.wajib_selesai,
          selesai: lp?.status === 'selesai',
          posisi_detik: lp?.posisi_detik ?? 0,
          terkunci,
          drip_info: terkunci ? `Terbuka pada ${new Date(l.drip_release_at!).toLocaleDateString('id-ID')}` : undefined,
          video_url: l.content_url ?? undefined,
          konten: l.content_body ?? undefined,
        };
      }),
  }));

  return {
    id: course.id,
    judul: course.judul,
    enrollment_id: enrollment?.id ?? null,
    enrollment_status: enrollment?.status ?? null,
    progress_percent: Number(courseProgress?.persen_selesai ?? 0),
    sections: sectionsOut,
  };
}

export async function getCourseProgress(actor: AuthContext, courseId: string) {
  const enrollment = await enrollmentsRepo.findActiveByUserCourse(actor.userId, courseId);
  if (!enrollment) throw AppError.notFound('No enrolment found for this course', 'enrollment.not_found_for_course');
  const cp = await repo.getCourseProgress(enrollment.id);
  return (
    cp ?? {
      enrollment_id: enrollment.id,
      persen_selesai: '0',
      jumlah_lesson_selesai: 0,
      total_lesson: 0,
      last_accessed_at: null,
      completed_at: null,
    }
  );
}

// ── Notes ───────────────────────────────────────────────

export async function listNotes(actor: AuthContext, lessonId: string) {
  const lesson = await repo.lessonCourseId(lessonId);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const enrollment = await requireOwnEnrollment(actor, lesson.course_id);
  return repo.listNotes(enrollment.id, lessonId);
}

export async function createNote(actor: AuthContext, lessonId: string, input: CreateNoteInput) {
  const lesson = await repo.lessonCourseId(lessonId);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const enrollment = await requireOwnEnrollment(actor, lesson.course_id);
  const { id } = await repo.insertNote({
    enrollment_id: enrollment.id,
    lesson_id: lessonId,
    isi: input.isi,
    timestamp_detik: input.timestamp_detik ?? null,
  });
  return repo.findNote(id);
}

async function requireOwnNote(actor: AuthContext, id: string) {
  const note = await repo.findNote(id);
  if (!note) throw AppError.notFound('Note not found', 'note.not_found');
  const enrollment = await enrollmentsRepo.detail(note.enrollment_id);
  if (!enrollment || enrollment.user_id !== actor.userId) throw AppError.forbidden('This note is not yours', 'note.not_owner');
  return note;
}

export async function updateNote(actor: AuthContext, id: string, input: UpdateNoteInput) {
  await requireOwnNote(actor, id);
  const fields: Record<string, unknown> = {};
  if (input.isi !== undefined) fields.isi = input.isi;
  if (input.timestamp_detik !== undefined) fields.timestamp_detik = input.timestamp_detik;
  await repo.updateNote(id, fields);
  return repo.findNote(id);
}

export async function removeNote(actor: AuthContext, id: string) {
  await requireOwnNote(actor, id);
  await repo.softDeleteNote(id);
}

// ── Bookmarks ───────────────────────────────────────────

export async function listBookmarks(actor: AuthContext, lessonId: string) {
  const lesson = await repo.lessonCourseId(lessonId);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const enrollment = await requireOwnEnrollment(actor, lesson.course_id);
  return repo.listBookmarks(enrollment.id, lessonId);
}

export async function createBookmark(actor: AuthContext, lessonId: string, input: CreateBookmarkInput) {
  const lesson = await repo.lessonCourseId(lessonId);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const enrollment = await requireOwnEnrollment(actor, lesson.course_id);
  const { id } = await repo.insertBookmark({
    enrollment_id: enrollment.id,
    lesson_id: lessonId,
    posisi_detik: input.posisi_detik ?? null,
    catatan: input.catatan ?? null,
  });
  return repo.findBookmark(id);
}

export async function removeBookmark(actor: AuthContext, id: string) {
  const bookmark = await repo.findBookmark(id);
  if (!bookmark) throw AppError.notFound('Bookmark not found', 'bookmark.not_found');
  const enrollment = await enrollmentsRepo.detail(bookmark.enrollment_id);
  if (!enrollment || enrollment.user_id !== actor.userId) throw AppError.forbidden('This bookmark is not yours', 'bookmark.not_owner');
  await repo.hardDeleteBookmark(id);
}
