import { AppError } from '../../core/http/AppError';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './progress.repository';
import * as enrollmentsRepo from '../enrollments/enrollments.repository';
import { CreateBookmarkInput, CreateNoteInput, UpdateLessonProgressInput, UpdateNoteInput } from './progress.validation';

const FULL_COMPLETION_PERCENT = 100;

const isSuper = (actor: AuthContext) => actor.permissions.has('*');

/** search enrollment student yang masih punya akses (terdaftar/active) untuk sebuah course. */
async function requireOwnEnrollment(actor: AuthContext, courseId: string) {
  const e = await enrollmentsRepo.findActiveByUserCourse(actor.userId, courseId);
  if (!e || !['registered', 'active'].includes(e.status)) {
    throw AppError.forbidden('You do not have active access to this course', 'course.no_active_access');
  }
  if (e.akses_kedaluwarsa_at && new Date(e.akses_kedaluwarsa_at) < new Date()) {
    throw AppError.forbidden('Your access to this course has expired', 'course.access_expired');
  }
  return e;
}

export async function recalcCourseProgress(enrollmentId: string, courseId: string) {
  const { mandatory, total } = await repo.countCourseLessons(courseId);
  const finish = await repo.countCompletedMandatoryLessons(enrollmentId, courseId);
  const target = mandatory > 0 ? mandatory : total;
  const percent = target > 0 ? Math.min(100, Math.round((finish / target) * 10000) / 100) : 0;
  const completed = target > 0 && finish >= target;

  const cp = await repo.upsertCourseProgress({
    enrollment_id: enrollmentId,
    progress_percent: percent,
    completed_lessons_count: finish,
    total_lesson: target,
    completed,
  });

  if (completed && percent >= FULL_COMPLETION_PERCENT) {
    await enrollmentsRepo.markSelesai(enrollmentId);
  }
  return cp;
}

export async function updateLessonProgress(actor: AuthContext, lessonId: string, input: UpdateLessonProgressInput) {
  const lesson = await repo.lessonCourseId(lessonId);
  if (!lesson) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  const enrollment = await requireOwnEnrollment(actor, lesson.course_id);

  // Buka pelajaran pertama → Terdaftar menjadi active (state machine enrollment, view modul 05).
  await enrollmentsRepo.activateIfTerdaftar(enrollment.id);

  const existing = await repo.findLessonProgress(enrollment.id, lessonId);
  const status = input.status ?? existing?.status ?? 'in_progress';
  const posisi = input.position_seconds ?? existing?.position_seconds ?? 0;

  const lp = await repo.upsertLessonProgress({
    enrollment_id: enrollment.id,
    lesson_id: lessonId,
    status,
    position_seconds: posisi,
  });

  const courseProgress = await recalcCourseProgress(enrollment.id, lesson.course_id);
  return { lesson_progress: lp, course_progress: courseProgress };
}

/**
 * Tampilan belajar untuk student ter-enroll: kurikulum lengkap + status progres tiap lesson.
 * Berbeda from GET /courses/:id (manajemen) — endpointst ini di-scope to enrollment milik sendiri
 * dan tetap bisa diakses setelah course finish (review material).
 */
export async function learnView(actor: AuthContext, courseId: string) {
  const course = await repo.learnCourse(courseId);
  if (!course) throw AppError.notFound('Course not found', 'course.not_found');

  const actualCourseId = course.id;
  let enrollment = await enrollmentsRepo.findActiveByUserCourse(actor.userId, actualCourseId);
  let isEnrolled = !!enrollment && ['registered', 'active', 'completed'].includes(enrollment.status);

  // Auto-enroll free courses if student visits learn view
  if (!isEnrolled && Number(course.price || 0) === 0) {
    try {
      const inserted = await enrollmentsRepo.insert({
        user_id: actor.userId,
        course_id: actualCourseId,
        cohort_id: null,
        source: 'buy',
        order_item_id: null,
        assigned_by: null,
        akses_kedaluwarsa_at: null,
        notes: 'Auto-enrolled free course',
      });
      await enrollmentsRepo.activateIfTerdaftar(inserted.id);
      enrollment = await enrollmentsRepo.findActiveByUserCourse(actor.userId, actualCourseId);
      isEnrolled = !!enrollment && ['registered', 'active', 'completed'].includes(enrollment.status);
    } catch {
      enrollment = await enrollmentsRepo.findActiveByUserCourse(actor.userId, actualCourseId);
      isEnrolled = !!enrollment && ['registered', 'active', 'completed'].includes(enrollment.status);
    }
  }

  // Super admins and course instructors can access course content without enrollment
  const isStaff = isEnrolled ? false : isSuper(actor) || (await repo.isCourseInstructor(actualCourseId, actor.userId));

  if (!isEnrolled && !isStaff) {
    throw AppError.forbidden('You are not enrolled in this course', 'enrollment.not_enrolled_course');
  }
  if (
    isEnrolled &&
    enrollment!.status !== 'completed' &&
    enrollment!.akses_kedaluwarsa_at &&
    new Date(enrollment!.akses_kedaluwarsa_at) < new Date()
  ) {
    throw AppError.forbidden('Your access to this course has expired', 'course.access_expired');
  }

  let [sections, lessons, allContents, lessonProgress, courseProgress] = await Promise.all([
    repo.learnSections(actualCourseId),
    repo.learnLessons(actualCourseId),
    repo.learnLessonContents(actualCourseId),
    enrollment ? repo.lessonProgressOfEnrollment(enrollment.id) : Promise.resolve([]),
    enrollment ? repo.getCourseProgress(enrollment.id) : Promise.resolve(null),
  ]);

  if (enrollment && (!courseProgress || Number(courseProgress.progress_percent) === 0)) {
    courseProgress = await recalcCourseProgress(enrollment.id, actualCourseId);
  }

  const progressByLesson = new Map(lessonProgress.map((lp) => [lp.lesson_id, lp]));
  const contentsByLesson = new Map<string, Array<{ id: string; type: string; body: string | undefined; url: string | undefined; language?: string }>>();
  for (const c of allContents) {
    if (!contentsByLesson.has(c.lesson_id)) contentsByLesson.set(c.lesson_id, []);
    contentsByLesson.get(c.lesson_id)!.push({
      id: c.id,
      type: c.type,
      body: c.content_body ?? undefined,
      url: c.content_url ?? undefined,
      language: c.language ?? 'all',
    });
  }

  const now = new Date();

  const sectionsOut = sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: lessons
      .filter((l) => l.section_id === s.id)
      .map((l) => {
        const lp = progressByLesson.get(l.id);
        const isLocked = !!l.drip_release_at && new Date(l.drip_release_at) > now;
        return {
          id: l.id,
          title: l.title,
          type: l.type,
          duration_minutes: l.duration_minutes,
          durasi: l.duration_minutes,
          must_complete: l.must_complete,
          is_completed: lp?.status === 'completed',
          finish: lp?.status === 'completed',
          position_seconds: lp?.position_seconds ?? 0,
          is_locked: isLocked,
          terkunci: isLocked,
          drip_info: isLocked
            ? `Available on ${new Date(l.drip_release_at!).toLocaleDateString('en-US', { dateStyle: 'medium' })}`
            : undefined,
          video_url: l.content_url ?? undefined,
          content: l.content_body ?? undefined,
          contents: contentsByLesson.get(l.id) ?? [],
        };
      }),
  }));

  return {
    id: course.id,
    title: course.title,
    enrollment_id: enrollment?.id ?? null,
    enrollment_status: enrollment?.status ?? null,
    progress_percent: Number(courseProgress?.progress_percent ?? 0),
    /** Student boleh mengulang course ini from nol (POST /enrollments/:id/restart). */
    allow_restart: course.allow_restart,
    /** exam akhir yang membuka certificate; null = tanpa exam. */
    final_exam: course.final_exam_quiz_id ? { quiz_id: course.final_exam_quiz_id, title: course.final_exam_title } : null,
    sections: sectionsOut,
  };
}

export async function getCourseProgress(actor: AuthContext, courseId: string) {
  const course = await repo.learnCourse(courseId);
  const actualCourseId = course?.id ?? courseId;
  const enrollment = await enrollmentsRepo.findActiveByUserCourse(actor.userId, actualCourseId);
  if (!enrollment) throw AppError.notFound('No enrolment found for this course', 'enrollment.not_found_for_course');
  let cp = await repo.getCourseProgress(enrollment.id);
  if (!cp || Number(cp.progress_percent) === 0) {
    cp = await recalcCourseProgress(enrollment.id, actualCourseId);
  }
  return (
    cp ?? {
      enrollment_id: enrollment.id,
      progress_percent: '0',
      completed_lessons_count: 0,
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
    content: input.content,
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
  if (input.content !== undefined) fields.content = input.content;
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
    position_seconds: input.position_seconds ?? null,
    notes: input.notes ?? null,
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
