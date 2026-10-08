import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './assessments.repository';
import * as enrollmentsRepo from '../enrollments/enrollments.repository';
import { autoGradeAttempt } from '../grading/grading.service';
import { getSetting } from '../../core/settings/settings';
import { bolehMulaiPercobaan, nilaiLulusEfektif, persenSkor } from '../certificates/completion-rules';
import {
  CreateAssignmentInput,
  CreateQuestionBankInput,
  CreateQuestionInput,
  CreateQuizInput,
  SaveAnswerInput,
  SetQuizQuestionsInput,
  SubmitAssignmentInput,
  UpdateAssignmentInput,
  UpdateQuestionBankInput,
  UpdateQuestionInput,
  UpdateQuizInput,
  UpsertRubricInput,
} from './assessments.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isElevated = (actor: AuthContext) =>
  isSuper(actor) || actor.roles.some((r) => ['admin_ops', 'direktur', 'ketua', 'pembina'].includes(r));
const instructorScope = (actor: AuthContext): string | null => (isElevated(actor) ? null : actor.userId);
const isTeaching = (actor: AuthContext) => actor.roles.some((r) => ['instructor', 'asisten'].includes(r));

/**
 * Cakupan daftar assessment (quiz/assignment) per peran:
 * - elevated (admin/direktur/…) → semua
 * - instructor/asisten → hanya course yang diajar
 * - student/lainnya → hanya course yang enrollment-nya aktif/terdaftar
 */
function listScope(actor: AuthContext): { ownerUserId?: string | null; enrolledUserId?: string | null } {
  if (isElevated(actor)) return {};
  if (isTeaching(actor)) return { ownerUserId: actor.userId };
  return { enrolledUserId: actor.userId };
}

async function assertCourseOwnership(actor: AuthContext, courseId: string) {
  if (isElevated(actor)) return;
  const owns = await repo.isCourseOwnedByInstructor(courseId, actor.userId);
  if (!owns) throw AppError.forbidden('This is outside the courses you manage', 'scope.course_out_of_scope');
}

/**
 * Cari enrollment student dengan akses ke sebuah course (dipakai attempt/submission).
 *
 * `selesai` ikut diterima: enrollment menjadi selesai begitu pelajaran wajib
 * terakhir ditandai, dan justru setelah itulah ujian akhir dikerjakan. Tanpa
 * ini ujian di akhir course tidak pernah bisa dimulai.
 */
async function requireOwnEnrollment(actor: AuthContext, courseId: string) {
  const e = await enrollmentsRepo.findActiveByUserCourse(actor.userId, courseId);
  if (!e || !['terdaftar', 'aktif', 'selesai'].includes(e.status)) {
    throw AppError.forbidden('You do not have active access to this course', 'course.no_active_access');
  }
  return e;
}

// ── Question Banks ──────────────────────────────────────

export async function listQuestionBanks(actor: AuthContext, filters: { course_id?: string; category_id?: string }) {
  return repo.listQuestionBanks({ ...filters, ownerUserId: instructorScope(actor) });
}

async function assertBankOwnership(actor: AuthContext, bank: repo.QuestionBankRow) {
  if (isElevated(actor)) return;
  if (bank.course_id) return assertCourseOwnership(actor, bank.course_id);
  throw AppError.forbidden('Only an admin can manage a question bank that spans categories', 'question_bank.manage_cross_category_requires_admin');
}

export async function questionBankDetail(actor: AuthContext, id: string) {
  const bank = await repo.questionBankDetail(id);
  if (!bank) throw AppError.notFound('Question bank not found', 'question_bank.not_found');
  await assertBankOwnership(actor, bank);
  return bank;
}

export async function createQuestionBank(actor: AuthContext, input: CreateQuestionBankInput) {
  if (input.course_id) await assertCourseOwnership(actor, input.course_id);
  else if (!isElevated(actor)) throw AppError.forbidden('Only an admin can create a question bank that spans categories', 'question_bank.create_cross_category_requires_admin');

  const { id } = await repo.insertQuestionBank({
    name: input.name,
    course_id: input.course_id ?? null,
    category_id: input.category_id ?? null,
    description: input.description ?? null,
    created_by: actor.userId,
  });
  await recordAudit({ userId: actor.userId, module: 'bank_soal', action: 'create', entity: 'question_banks', entityId: id, after: input });
  return repo.questionBankDetail(id);
}

export async function updateQuestionBank(actor: AuthContext, id: string, input: UpdateQuestionBankInput) {
  const bank = await questionBankDetail(actor, id);
  await repo.updateQuestionBank(id, input);
  await recordAudit({ userId: actor.userId, module: 'bank_soal', action: 'update', entity: 'question_banks', entityId: id, before: bank, after: input });
  return repo.questionBankDetail(id);
}

export async function removeQuestionBank(actor: AuthContext, id: string) {
  await questionBankDetail(actor, id);
  await repo.softDeleteQuestionBank(id);
  await recordAudit({ userId: actor.userId, module: 'bank_soal', action: 'delete', entity: 'question_banks', entityId: id });
}

// ── Questions & Options ─────────────────────────────────

export async function listQuestions(actor: AuthContext, bankId: string) {
  await questionBankDetail(actor, bankId); // scope check
  // Opsi ikut dikirim (termasuk kunci jawaban) — endpoint ini hanya untuk
  // pengelola bank soal, dan layar penyunting soal membutuhkannya.
  const rows = await repo.listQuestions(bankId);
  return Promise.all(rows.map(async (q) => ({ ...q, options: await repo.listOptions(q.id) })));
}

export async function createQuestion(actor: AuthContext, bankId: string, input: CreateQuestionInput) {
  await questionBankDetail(actor, bankId); // scope check
  validateQuestionOptions(input.tipe, input.options);

  const { id } = await repo.insertQuestion({
    question_bank_id: bankId,
    tipe: input.tipe,
    teks_soal: input.teks_soal,
    poin: input.poin,
    penjelasan_jawaban: input.penjelasan_jawaban ?? null,
    meta: input.meta ?? null,
  });
  if (input.options.length) {
    await repo.replaceOptions(
      id,
      input.options.map((o) => ({ ...o, pasangan_key: o.pasangan_key ?? null })),
    );
  }
  await recordAudit({ userId: actor.userId, module: 'bank_soal', action: 'create', entity: 'questions', entityId: id, after: { tipe: input.tipe } });
  return { ...(await repo.questionDetail(id)), options: await repo.listOptions(id) };
}

function validateQuestionOptions(tipe: CreateQuestionInput['tipe'], options: CreateQuestionInput['options']) {
  if (tipe === 'benar_salah' && options.length && options.length !== 2) {
    throw AppError.badRequest('A true/false question must have exactly two options', 'question.true_false_needs_two_options');
  }
  if (['pilihan_tunggal', 'pilihan_ganda', 'benar_salah'].includes(tipe) && options.length) {
    const benar = options.filter((o) => o.is_benar).length;
    if (benar < 1) throw AppError.badRequest('Mark at least one option as the correct answer', 'question.needs_correct_option');
    if (tipe !== 'pilihan_ganda' && benar > 1) throw AppError.badRequest('This question type allows only one correct answer', 'question.single_answer_only');
  }
}

export async function updateQuestion(actor: AuthContext, id: string, input: UpdateQuestionInput) {
  const question = await repo.questionDetail(id);
  if (!question) throw AppError.notFound('Question not found', 'question.not_found');
  await questionBankDetail(actor, question.question_bank_id); // scope check

  const fields: Record<string, unknown> = {};
  if (input.teks_soal !== undefined) fields.teks_soal = input.teks_soal;
  if (input.poin !== undefined) fields.poin = input.poin;
  if (input.penjelasan_jawaban !== undefined) fields.penjelasan_jawaban = input.penjelasan_jawaban;
  if (input.meta !== undefined) fields.meta = input.meta ? JSON.stringify(input.meta) : null;
  await repo.updateQuestion(id, fields);

  if (input.options) {
    await repo.replaceOptions(
      id,
      input.options.map((o) => ({ ...o, pasangan_key: o.pasangan_key ?? null })),
    );
  }
  await recordAudit({ userId: actor.userId, module: 'bank_soal', action: 'update', entity: 'questions', entityId: id, before: question, after: input });
  return { ...(await repo.questionDetail(id)), options: await repo.listOptions(id) };
}

export async function removeQuestion(actor: AuthContext, id: string) {
  const question = await repo.questionDetail(id);
  if (!question) throw AppError.notFound('Question not found', 'question.not_found');
  await questionBankDetail(actor, question.question_bank_id);
  await repo.softDeleteQuestion(id);
  await recordAudit({ userId: actor.userId, module: 'bank_soal', action: 'delete', entity: 'questions', entityId: id });
}

// ── Quizzes ──────────────────────────────────────────────

export async function listQuizzes(actor: AuthContext, filters: { course_id?: string }) {
  // Student: sertakan status/nilai attempt miliknya (kolom Status yang benar),
  // plus apakah ia boleh mulai lagi sekarang — dihitung dengan aturan yang sama
  // dengan `startAttempt`, supaya tombol di layar tidak berbohong.
  if (!isElevated(actor) && !isTeaching(actor)) {
    const [rows, settingPassing] = await Promise.all([
      repo.listQuizzesForStudent(actor.userId, filters.course_id),
      getSetting('certificate.syarat_passing_score_min', ''),
    ]);
    return rows.map((q) => {
      const keputusan = bolehMulaiPercobaan({
        attemptMaksimal: q.max_attempts,
        jumlahPercobaan: q.used_attempts ?? 0,
        jedaMenit: q.retry_delay_minutes ?? 0,
        terakhirSelesaiAt: q.last_completed_at ?? null,
      });
      return {
        ...q,
        passing_score_val: nilaiLulusEfektif(q.passing_score, settingPassing),
        skor_terbaik_persen: q.best_score === null || q.best_score === undefined ? null : persenSkor(q.best_score, q.total_points),
        sisa_percobaan: keputusan.sisa,
        can_start: keputusan.boleh,
        can_retry_at: !keputusan.boleh && keputusan.alasan === 'jeda' ? keputusan.can_retry_at.toISOString() : null,
      };
    });
  }
  return repo.listQuizzes({ ...filters, ...listScope(actor) });
}

export async function quizDetail(actor: AuthContext, id: string) {
  const quiz = await repo.quizDetail(id);
  if (!quiz) throw AppError.notFound('Quiz not found', 'quiz.not_found');
  await assertCourseOwnership(actor, quiz.course_id);
  return quiz;
}

/** Detail untuk layar Quiz Builder: quiz + soal terpilih (urut) + apakah ia ujian akhir kursusnya. */
export async function quizDetailForEditor(actor: AuthContext, id: string) {
  const quiz = await quizDetail(actor, id);
  const [questions, isFinal] = await Promise.all([repo.quizQuestionLinks(id), repo.isFinalExamOfCourse(id, quiz.course_id)]);
  return { ...quiz, questions, is_ujian_akhir: isFinal };
}

export async function createQuiz(actor: AuthContext, input: CreateQuizInput) {
  await assertCourseOwnership(actor, input.course_id);
  const { id } = await repo.insertQuiz({
    course_id: input.course_id,
    section_id: input.section_id ?? null,
    lesson_id: input.lesson_id ?? null,
    title: input.title,
    description: input.description ?? null,
    batas_waktu_menit: input.batas_waktu_menit ?? null,
    acak_soal: input.acak_soal,
    acak_opsi: input.acak_opsi,
    max_attempts: input.max_attempts,
    retry_delay_minutes: input.retry_delay_minutes,
    passing_score: input.passing_score !== undefined && input.passing_score !== null ? String(input.passing_score) : null,
    tampilkan_jawaban_setelah_selesai: input.tampilkan_jawaban_setelah_selesai,
    is_active: input.is_active,
  });
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'create', entity: 'quizzes', entityId: id, after: input });
  return repo.quizDetail(id);
}

export async function updateQuiz(actor: AuthContext, id: string, input: UpdateQuizInput) {
  const quiz = await quizDetail(actor, id);
  const fields: Record<string, unknown> = { ...input };
  if (input.passing_score !== undefined) fields.passing_score = input.passing_score === null ? null : String(input.passing_score);
  await repo.updateQuiz(id, fields);
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'update', entity: 'quizzes', entityId: id, before: quiz, after: input });
  return repo.quizDetail(id);
}

export async function removeQuiz(actor: AuthContext, id: string) {
  await quizDetail(actor, id);
  await repo.softDeleteQuiz(id);
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'delete', entity: 'quizzes', entityId: id });
}

export async function setQuizQuestions(actor: AuthContext, id: string, input: SetQuizQuestionsInput) {
  await quizDetail(actor, id);
  await repo.replaceQuizQuestions(
    id,
    input.questions.map((q) => ({ question_id: q.question_id, sort_order: q.sort_order, poin_override: q.poin_override ?? null })),
  );
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'set_questions', entity: 'quizzes', entityId: id, after: input });
  return repo.quizQuestionsWithOptions(id);
}

// ── Assignments & Rubrics ───────────────────────────────

export async function listAssignments(actor: AuthContext, filters: { course_id?: string }) {
  if (!isElevated(actor) && !isTeaching(actor)) return repo.listAssignmentsForStudent(actor.userId, filters.course_id);
  return repo.listAssignments({ ...filters, ...listScope(actor) });
}

export async function assignmentDetail(actor: AuthContext, id: string) {
  const a = await repo.assignmentDetail(id);
  if (!a) throw AppError.notFound('Assignment not found', 'assignment.not_found');
  await assertCourseOwnership(actor, a.course_id);
  return a;
}

export async function createAssignment(actor: AuthContext, input: CreateAssignmentInput) {
  await assertCourseOwnership(actor, input.course_id);
  const { id } = await repo.insertAssignment({
    course_id: input.course_id,
    section_id: input.section_id ?? null,
    lesson_id: input.lesson_id ?? null,
    title: input.title,
    instructions: input.instructions,
    due_at: input.due_at ?? null,
    submission_type: input.submission_type,
    maksimal_ukuran_mb: input.maksimal_ukuran_mb ?? null,
    poin_maksimal: String(input.poin_maksimal),
    is_active: input.is_active,
  });
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'create', entity: 'assignments', entityId: id, after: input });
  return repo.assignmentDetail(id);
}

export async function updateAssignment(actor: AuthContext, id: string, input: UpdateAssignmentInput) {
  const before = await assignmentDetail(actor, id);
  const fields: Record<string, unknown> = { ...input };
  if (input.poin_maksimal !== undefined) fields.poin_maksimal = String(input.poin_maksimal);
  await repo.updateAssignment(id, fields);
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'update', entity: 'assignments', entityId: id, before, after: input });
  return repo.assignmentDetail(id);
}

export async function removeAssignment(actor: AuthContext, id: string) {
  await assignmentDetail(actor, id);
  await repo.softDeleteAssignment(id);
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'delete', entity: 'assignments', entityId: id });
}

export async function upsertRubric(actor: AuthContext, assignmentId: string, input: UpsertRubricInput) {
  await assignmentDetail(actor, assignmentId);
  const totalBobot = input.kriteria.reduce((s, k) => s + k.bobot, 0);
  if (Math.round(totalBobot) !== 100) throw AppError.unprocessable('Rubric criteria weights must add up to 100%', 'rubric.weights_must_total_100');
  const { id } = await repo.upsertRubric(assignmentId, input.kriteria);
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'upsert_rubric', entity: 'rubrics', entityId: id, after: input });
  return repo.rubricByAssignment(assignmentId);
}

// ── Quiz Attempts (student) ────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function startAttempt(actor: AuthContext, quizId: string) {
  const quiz = await repo.quizDetail(quizId);
  if (!quiz) throw AppError.notFound('Quiz not found', 'quiz.not_found');
  if (!quiz.is_active) throw AppError.badRequest('This quiz is not active', 'quiz.inactive');
  const enrollment = await requireOwnEnrollment(actor, quiz.course_id);

  const [jumlahAttempt, terakhirSelesaiAt] = await Promise.all([
    repo.countAttempts(enrollment.id, quizId),
    repo.lastSubmittedAt(enrollment.id, quizId),
  ]);
  const keputusan = bolehMulaiPercobaan({
    attemptMaksimal: quiz.max_attempts,
    jumlahPercobaan: jumlahAttempt,
    jedaMenit: quiz.retry_delay_minutes ?? 0,
    terakhirSelesaiAt,
  });
  if (!keputusan.boleh && keputusan.alasan === 'batas') {
    throw AppError.conflict('You have reached the attempt limit for this quiz', 'quiz.attempt_limit_reached');
  }
  if (!keputusan.boleh && keputusan.alasan === 'jeda') {
    throw AppError.conflict(
      `You can retake this quiz after ${keputusan.can_retry_at.toISOString()}`,
      'quiz.retake_cooldown',
      { can_retry_at: keputusan.can_retry_at.toISOString() },
    );
  }

  const attempt = await repo.insertAttempt({
    enrollment_id: enrollment.id,
    quiz_id: quizId,
    attempt_ke: jumlahAttempt + 1,
    waktu_tersisa_detik: quiz.batas_waktu_menit ? quiz.batas_waktu_menit * 60 : null,
  });

  let quizQuestions = await repo.quizQuestionsWithOptions(quizId);
  if (quiz.acak_soal) quizQuestions = shuffle(quizQuestions);
  const soal = quizQuestions.map((qq) => ({
    question_id: qq.question.id,
    tipe: qq.question.tipe,
    teks_soal: qq.question.teks_soal,
    poin: qq.poin_override ?? qq.question.poin,
    sort_order: qq.sort_order,
    // is_benar disembunyikan dari student selama pengerjaan.
    opsi: (quiz.acak_opsi ? shuffle(qq.options) : qq.options).map((o) => ({
      id: o.id,
      teks_opsi: o.teks_opsi,
      pasangan_key: o.pasangan_key,
      sort_order: o.sort_order,
    })),
  }));

  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'start_attempt', entity: 'quiz_attempts', entityId: attempt.id });
  return { attempt, soal };
}

async function requireOwnAttempt(actor: AuthContext, attemptId: string) {
  const attempt = await repo.attemptDetail(attemptId);
  if (!attempt) throw AppError.notFound('Attempt not found', 'quiz.attempt_not_found');
  const enrollment = await enrollmentsRepo.detail(attempt.enrollment_id);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  if (enrollment.user_id !== actor.userId && !isElevated(actor)) {
    const quiz = await repo.quizDetail(attempt.quiz_id);
    if (!quiz || !(await repo.isCourseOwnedByInstructor(quiz.course_id, actor.userId))) {
      throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
    }
  }
  return { attempt, enrollment };
}

export async function attemptDetail(actor: AuthContext, attemptId: string) {
  const { attempt } = await requireOwnAttempt(actor, attemptId);
  const answers = await repo.listAnswers(attemptId);
  return { attempt, answers };
}

export async function saveAnswer(actor: AuthContext, attemptId: string, input: SaveAnswerInput) {
  const { attempt, enrollment } = await requireOwnAttempt(actor, attemptId);
  if (enrollment.user_id !== actor.userId) throw AppError.forbidden('Only the person taking this attempt can answer', 'quiz.answer_requires_owner');
  if (attempt.status !== 'sedang') throw AppError.conflict('This attempt cannot be changed in its current state', 'quiz.attempt_not_editable');
  return repo.upsertAnswer(attemptId, input.question_id, input.jawaban);
}

export async function submitAttempt(actor: AuthContext, attemptId: string) {
  const { attempt, enrollment } = await requireOwnAttempt(actor, attemptId);
  if (enrollment.user_id !== actor.userId) throw AppError.forbidden('Only the person taking this attempt can submit it', 'quiz.submit_requires_owner');
  if (attempt.status !== 'sedang') throw AppError.conflict('This attempt has already been submitted', 'quiz.attempt_already_submitted');

  await repo.updateAttempt(attemptId, { status: 'dikumpulkan', selesai_at: new Date() });
  await recordAudit({ userId: actor.userId, module: 'assessment', action: 'submit_attempt', entity: 'quiz_attempts', entityId: attemptId });

  // Auto-grade objektif langsung di service grading; esai/upload_file menunggu manual.
  await autoGradeAttempt(attemptId);

  const updated = await repo.attemptDetail(attemptId);
  const answers = await repo.listAnswers(attemptId);
  return { attempt: updated, answers };
}

// ── Assignment Submissions (student) ──────────────────────

export async function submitAssignment(actor: AuthContext, assignmentId: string, input: SubmitAssignmentInput) {
  const assignment = await repo.assignmentDetail(assignmentId);
  if (!assignment) throw AppError.notFound('Assignment not found', 'assignment.not_found');
  if (!assignment.is_active) throw AppError.badRequest('This assignment is not active', 'assignment.inactive');
  const enrollment = await requireOwnEnrollment(actor, assignment.course_id);

  const existing = await repo.findSubmission(enrollment.id, assignmentId);
  let submission: repo.SubmissionRow;
  if (existing && existing.status === 'revisi_diminta') {
    submission = await repo.resubmit(existing.id, {
      isi_teks: input.isi_teks ?? null,
      file_media_id: input.file_media_id ?? null,
      url: input.url ?? null,
    });
  } else if (existing) {
    throw AppError.conflict('This assignment has been submitted and is awaiting grading or a revision request', 'assignment.already_submitted');
  } else {
    submission = await repo.insertSubmission({
      enrollment_id: enrollment.id,
      assignment_id: assignmentId,
      isi_teks: input.isi_teks ?? null,
      file_media_id: input.file_media_id ?? null,
      url: input.url ?? null,
    });
  }

  await recordAudit({
    userId: actor.userId,
    module: 'assessment',
    action: existing ? 'resubmit_assignment' : 'submit_assignment',
    entity: 'submissions',
    entityId: submission.id,
  });
  return submission;
}

export async function listSubmissionsForAssignment(actor: AuthContext, assignmentId: string) {
  await assignmentDetail(actor, assignmentId); // scope check instructor
  return repo.listSubmissionsForAssignment(assignmentId);
}
