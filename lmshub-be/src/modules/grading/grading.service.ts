import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { withTransaction } from '../../core/db/withTransaction';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './grading.repository';
import * as assessmentsRepo from '../assessments/assessments.repository';
import { AdjustGradeInput, GradeSubmissionInput, ReleaseGradeInput, RequestRevisionInput } from './grading.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isElevated = (actor: AuthContext) =>
  isSuper(actor) || actor.roles.some((r) => ['admin_ops', 'direktur', 'ketua', 'pembina'].includes(r));

/** Bobot komponen (kuis/tugas) belum tersedia (courses.bobot_komponen di luar cakupan domain 03/04) —
 * pakai rata-rata sederhana antar komponen & ambang lulus default sampai domain pengaturan (12) tersedia. */
const DEFAULT_PASSING_SCORE = 70;

async function assertCourseOwnership(actor: AuthContext, courseId: string) {
  if (isElevated(actor)) return;
  const owns = await repo.isCourseOwnedByInstructor(courseId, actor.userId);
  if (!owns) throw AppError.forbidden('This is outside the courses you manage', 'scope.course_out_of_scope');
}

/** Antrian penilaian: staf melihat semua, instruktur/asisten hanya kursus miliknya. */
export async function listSubmissions(
  actor: AuthContext,
  p: { limit: number; offset: number },
  filters: { status?: string },
) {
  const instructorUserId = isElevated(actor) ? null : actor.userId;
  return repo.listSubmissionsQueue(p, { status: filters.status, instructorUserId });
}

// ── Auto-grade (dipanggil dari assessments.service saat attempt disubmit) ─

type GradedAnswer = { skor: number; isBenar: boolean | null; manual: boolean };

function gradeSingleAnswer(
  tipe: assessmentsRepo.QuestionTipe,
  poin: number,
  options: assessmentsRepo.QuestionOptionRow[],
  jawabanRaw: unknown,
): GradedAnswer {
  const j = (jawabanRaw ?? {}) as Record<string, unknown>;
  switch (tipe) {
    case 'pilihan_tunggal':
    case 'benar_salah': {
      const correct = options.find((o) => o.is_benar);
      const selected = typeof j.option_id === 'string' ? j.option_id : undefined;
      const isBenar = !!correct && selected === correct.id;
      return { skor: isBenar ? poin : 0, isBenar, manual: false };
    }
    case 'pilihan_ganda': {
      const correctIds = new Set(options.filter((o) => o.is_benar).map((o) => o.id));
      const selectedIds = Array.isArray(j.option_ids) ? (j.option_ids as string[]) : [];
      const allMatch = selectedIds.length === correctIds.size && selectedIds.every((id) => correctIds.has(id));
      return { skor: allMatch ? poin : 0, isBenar: allMatch, manual: false };
    }
    case 'pencocokan': {
      const pairs = Array.isArray(j.pairs) ? (j.pairs as Array<{ option_id: string; pasangan_key: string }>) : [];
      const byId = new Map(options.map((o) => [o.id, o]));
      let correct = 0;
      for (const p of pairs) {
        const opt = byId.get(p.option_id);
        if (opt?.pasangan_key && opt.pasangan_key === p.pasangan_key) correct += 1;
      }
      const total = options.filter((o) => o.pasangan_key).length || 1;
      const fraction = Math.min(1, correct / total);
      return { skor: Math.round(poin * fraction * 100) / 100, isBenar: fraction === 1, manual: false };
    }
    case 'isian_singkat': {
      const teks = typeof j.teks === 'string' ? j.teks.trim().toLowerCase() : '';
      const isBenar = options.some((o) => o.is_benar && o.teks_opsi.trim().toLowerCase() === teks);
      return { skor: isBenar ? poin : 0, isBenar, manual: false };
    }
    case 'esai':
    case 'upload_file':
    default:
      return { skor: 0, isBenar: null, manual: true };
  }
}

/**
 * Auto-grade objektif saat attempt disubmit (dipanggil dari `assessments.service`).
 * Tipe esai/upload_file selalu masuk antrean manual (`attempt_answers.dinilai_manual=true`),
 * status attempt tetap `dikumpulkan` sampai dinilai manual oleh instruktur/TA.
 */
export async function autoGradeAttempt(attemptId: string): Promise<void> {
  const attempt = await assessmentsRepo.attemptDetail(attemptId);
  if (!attempt) throw AppError.notFound('Attempt not found', 'quiz.attempt_not_found');
  const quiz = await assessmentsRepo.quizDetail(attempt.quiz_id);
  if (!quiz) throw AppError.notFound('Quiz not found', 'quiz.not_found');

  const quizQuestions = await assessmentsRepo.quizQuestionsWithOptions(quiz.id);
  const answers = await assessmentsRepo.listAnswers(attemptId);
  const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]));

  let totalSkor = 0;
  let butuhManual = false;
  const updates: Array<{ id: string; skor: number | null; isBenar: boolean | null; manual: boolean }> = [];

  for (const qq of quizQuestions) {
    const poin = qq.poin_override !== null ? Number(qq.poin_override) : Number(qq.question.poin);
    const answer = answerByQuestion.get(qq.question_id);
    if (!answer) continue; // tidak dijawab = 0 poin, tidak perlu grading manual
    if (['esai', 'upload_file'].includes(qq.question.tipe)) {
      butuhManual = true;
      updates.push({ id: answer.id, skor: null, isBenar: null, manual: true });
      continue;
    }
    const graded = gradeSingleAnswer(qq.question.tipe, poin, qq.options, answer.jawaban);
    totalSkor += graded.skor;
    updates.push({ id: answer.id, skor: graded.skor, isBenar: graded.isBenar, manual: false });
  }

  await withTransaction(async (tx) => {
    for (const u of updates) {
      await assessmentsRepo.updateAnswerGrading(u.id, { skor_didapat: u.skor, is_benar: u.isBenar, dinilai_manual: u.manual }, tx);
    }
    if (!butuhManual) {
      await assessmentsRepo.updateAttempt(attemptId, { status: 'dinilai', skor: totalSkor }, tx);
      const existing = await repo.findGradeBySource('quiz', attemptId);
      if (existing) {
        await repo.updateGrade(existing.id, { skor: totalSkor, skor_maksimal: Number(quiz.total_poin), dinilai_at: new Date() }, tx);
      } else {
        await repo.insertGrade(
          {
            enrollment_id: attempt.enrollment_id,
            sumber_tipe: 'quiz',
            sumber_id: attemptId,
            skor: totalSkor,
            skor_maksimal: Number(quiz.total_poin) || 1,
            feedback: null,
            dinilai_oleh: null, // NULL = auto-grade sistem
          },
          tx,
        );
      }
    }
    // status tetap 'dikumpulkan' bila ada soal esai/upload_file menunggu grading manual.
  });

  if (!butuhManual) await recalcGradebook(attempt.enrollment_id);
}

// ── Manual grading (submission tugas) ───────────────────

export async function getSubmissionGrade(actor: AuthContext, submissionId: string) {
  const submission = await assessmentsRepo.submissionDetail(submissionId);
  if (!submission) throw AppError.notFound('Submission not found', 'submission.not_found');
  const assignment = await assessmentsRepo.assignmentDetail(submission.assignment_id);
  if (!assignment) throw AppError.notFound('Assignment not found', 'assignment.not_found');
  if (!isElevated(actor)) {
    const owns = await repo.isCourseOwnedByInstructor(assignment.course_id, actor.userId);
    const isOwnerStudent = submission.enrollment_id && actor.roles.includes('siswa');
    if (!owns && !isOwnerStudent) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  }
  const grade = await repo.findGradeBySource('assignment', submissionId);
  return { submission, grade };
}

export async function manualGradeSubmission(actor: AuthContext, submissionId: string, input: GradeSubmissionInput) {
  const submission = await assessmentsRepo.submissionDetail(submissionId);
  if (!submission) throw AppError.notFound('Submission not found', 'submission.not_found');
  const assignment = await assessmentsRepo.assignmentDetail(submission.assignment_id);
  if (!assignment) throw AppError.notFound('Assignment not found', 'assignment.not_found');
  await assertCourseOwnership(actor, assignment.course_id);

  const existing = await repo.findGradeBySource('assignment', submissionId);
  if (existing?.rilis_at) {
    throw AppError.conflict('This grade has already been released — use the adjustment endpoint', 'grading.released_use_adjust');
  }

  const feedback = input.feedback ?? null;
  const rincianFeedback = input.rubrik ? { rubrik: input.rubrik, catatan: feedback } : feedback;

  let grade: repo.GradeRow;
  if (existing) {
    grade = await repo.updateGrade(existing.id, {
      skor: input.skor,
      skor_maksimal: input.skor_maksimal,
      feedback: JSON.stringify(rincianFeedback),
      dinilai_oleh: actor.userId,
      dinilai_at: new Date(),
    });
  } else {
    grade = await repo.insertGrade({
      enrollment_id: submission.enrollment_id,
      sumber_tipe: 'assignment',
      sumber_id: submissionId,
      skor: input.skor,
      skor_maksimal: input.skor_maksimal,
      feedback: JSON.stringify(rincianFeedback),
      dinilai_oleh: actor.userId,
    });
  }
  await assessmentsRepo.setSubmissionStatus(submissionId, 'dinilai');

  await recordAudit({
    userId: actor.userId,
    module: 'grading',
    action: existing ? 'update' : 'create',
    entity: 'grades',
    entityId: grade.id,
    before: existing ? { skor: existing.skor, skor_maksimal: existing.skor_maksimal } : null,
    after: { skor: input.skor, skor_maksimal: input.skor_maksimal },
  });

  await recalcGradebook(submission.enrollment_id);
  return grade;
}

export async function requestRevision(actor: AuthContext, submissionId: string, input: RequestRevisionInput) {
  const submission = await assessmentsRepo.submissionDetail(submissionId);
  if (!submission) throw AppError.notFound('Submission not found', 'submission.not_found');
  const assignment = await assessmentsRepo.assignmentDetail(submission.assignment_id);
  if (!assignment) throw AppError.notFound('Assignment not found', 'assignment.not_found');
  await assertCourseOwnership(actor, assignment.course_id);

  await assessmentsRepo.setSubmissionRevision(submissionId, input.catatan);
  await recordAudit({
    userId: actor.userId,
    module: 'grading',
    action: 'request_revision',
    entity: 'submissions',
    entityId: submissionId,
    reason: input.catatan,
  });
  // Siswa kembali ke status "Belum" secara efektif melalui `submissions.status='revisi_diminta'`
  // (siklus submit ulang dikelola modul assessments — `resubmit()` menaikkan `revisi_ke`).
  return assessmentsRepo.submissionDetail(submissionId);
}

// ── Release & post-release adjustment ───────────────────

export async function releaseGrade(actor: AuthContext, gradeId: string, _input: ReleaseGradeInput) {
  const grade = await repo.gradeDetail(gradeId);
  if (!grade) throw AppError.notFound('Grade not found', 'grading.not_found');
  const courseId = await repo.courseIdForEnrollment(grade.enrollment_id);
  if (courseId) await assertCourseOwnership(actor, courseId);
  if (grade.rilis_at) throw AppError.conflict('This grade has already been released', 'grading.already_released');

  const released = await repo.releaseGrade(gradeId);
  await recordAudit({
    userId: actor.userId,
    module: 'grading',
    action: 'release',
    entity: 'grades',
    entityId: gradeId,
    before: { rilis_at: null },
    after: { rilis_at: released.rilis_at },
  });
  // Catatan: pemberitahuan rilis nilai ke siswa ditangani modul notifikasi,
  // bukan di sini — lihat domain 14-notifikasi-reminder.
  return released;
}

/** Satu-satunya jalur ubah nilai pasca-rilis — tidak pernah menimpa diam-diam, selalu tercatat via recordAudit. */
export async function adjustGrade(actor: AuthContext, gradeId: string, input: AdjustGradeInput) {
  const grade = await repo.gradeDetail(gradeId);
  if (!grade) throw AppError.notFound('Grade not found', 'grading.not_found');
  if (!grade.rilis_at) throw AppError.badRequest('This grade has not been released yet — use the normal grading endpoint', 'grading.not_released_use_grading');
  const courseId = await repo.courseIdForEnrollment(grade.enrollment_id);
  if (courseId) await assertCourseOwnership(actor, courseId);

  const updated = await repo.updateGrade(gradeId, {
    skor: input.skor,
    skor_maksimal: input.skor_maksimal ?? grade.skor_maksimal,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'gradebook',
    action: 'adjust',
    entity: 'grades',
    entityId: gradeId,
    before: { skor: grade.skor, skor_maksimal: grade.skor_maksimal },
    after: { skor: input.skor, skor_maksimal: input.skor_maksimal ?? grade.skor_maksimal },
    reason: input.alasan,
  });
  await recalcGradebook(grade.enrollment_id);
  return updated;
}

// ── Gradebook ────────────────────────────────────────────

export async function recalcGradebook(enrollmentId: string): Promise<void> {
  const grades = await repo.listGradesForEnrollment(enrollmentId);
  if (!grades.length) {
    await repo.upsertGradebookEntry({ enrollment_id: enrollmentId, nilai_akhir: null, status_kelulusan: 'belum_selesai', rincian: [] });
    return;
  }
  const rincian = grades.map((g) => {
    const skor = Number(g.skor);
    const maks = Number(g.skor_maksimal) || 1;
    return { sumber_tipe: g.sumber_tipe, sumber_id: g.sumber_id, skor, skor_maksimal: maks, persen: Math.round((skor / maks) * 10000) / 100 };
  });
  const nilaiAkhir = Math.round((rincian.reduce((s, r) => s + r.persen, 0) / rincian.length) * 100) / 100;
  const status: repo.StatusKelulusan = nilaiAkhir >= DEFAULT_PASSING_SCORE ? 'lulus' : 'tidak_lulus';
  await repo.upsertGradebookEntry({ enrollment_id: enrollmentId, nilai_akhir: nilaiAkhir, status_kelulusan: status, rincian });
}

export async function getGradebook(actor: AuthContext, courseId: string) {
  await assertCourseOwnership(actor, courseId);
  return repo.gradebookForCourse(courseId);
}
