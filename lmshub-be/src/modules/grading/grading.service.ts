import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { withTransaction } from '../../core/db/withTransaction';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './grading.repository';
import * as assessmentsRepo from '../assessments/assessments.repository';
import { AdjustGradeInput, GradeSubmissionInput, ReleaseGradeInput, RequestRevisionInput } from './grading.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isElevated = (actor: AuthContext) =>
  isSuper(actor) || actor.roles.some((r) => ['operations_admin', 'director', 'chairperson', 'supervisor'].includes(r));

/** Bobot komponen (quiz/assignment) belum tersedia (courses.bobot_komponen di luar cakupan domain 03/04) —
 * pakai rata-rata sederhana antar komponen & ambang lulus default until domain settings (12) tersedia. */
const DEFAULT_PASSING_SCORE = 70;

async function assertCourseOwnership(actor: AuthContext, courseId: string) {
  if (isElevated(actor)) return;
  const owns = await repo.isCourseOwnedByInstructor(courseId, actor.userId);
  if (!owns) throw AppError.forbidden('This is outside the courses you manage', 'scope.course_out_of_scope');
}

/** Antrian penilaian: staf melihat semua, instructor/asisten hanya course miliknya. */
export async function listSubmissions(
  actor: AuthContext,
  p: { limit: number; offset: number },
  filters: { status?: string },
) {
  const instructorUserId = isElevated(actor) ? null : actor.userId;
  return repo.listSubmissionsQueue(p, { status: filters.status, instructorUserId });
}

// ── Auto-grade (dipanggil from assessments.service saat attempt disubmit) ─

type GradedAnswer = { score: number; isBenar: boolean | null; manual: boolean };

function gradeSingleAnswer(
  type: assessmentsRepo.QuestionTipe,
  points: number,
  options: assessmentsRepo.QuestionOptionRow[],
  answerRaw: unknown,
): GradedAnswer {
  const j = (answerRaw ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'single_choice':
    case 'true_false': {
      const correct = options.find((o) => o.is_correct);
      const selected = typeof j.option_id === 'string' ? j.option_id : undefined;
      const isBenar = !!correct && selected === correct.id;
      return { score: isBenar ? points : 0, isBenar, manual: false };
    }
    case 'multiple_choice': {
      const correctIds = new Set(options.filter((o) => o.is_correct).map((o) => o.id));
      const selectedIds = Array.isArray(j.option_ids) ? (j.option_ids as string[]) : [];
      const allMatch = selectedIds.length === correctIds.size && selectedIds.every((id) => correctIds.has(id));
      return { score: allMatch ? points : 0, isBenar: allMatch, manual: false };
    }
    case 'matching': {
      const pairs = Array.isArray(j.pairs) ? (j.pairs as Array<{ option_id: string; pair_key: string }>) : [];
      const byId = new Map(options.map((o) => [o.id, o]));
      let correct = 0;
      for (const p of pairs) {
        const opt = byId.get(p.option_id);
        if (opt?.pair_key && opt.pair_key === p.pair_key) correct += 1;
      }
      const total = options.filter((o) => o.pair_key).length || 1;
      const fraction = Math.min(1, correct / total);
      return { score: Math.round(points * fraction * 100) / 100, isBenar: fraction === 1, manual: false };
    }
    case 'short_answer': {
      const text = typeof j.text === 'string' ? j.text.trim().toLowerCase() : '';
      const isBenar = options.some((o) => o.is_correct && o.option_text.trim().toLowerCase() === text);
      return { score: isBenar ? points : 0, isBenar, manual: false };
    }
    case 'essay':
    case 'file_upload':
    default:
      return { score: 0, isBenar: null, manual: true };
  }
}

/**
 * Auto-grade objektif saat attempt disubmit (dipanggil from `assessments.service`).
 * Tipe esai/upload_file selalu login antrean manual (`attempt_answers.manually_graded=true`),
 * status attempt tetap `dikumpulkan` until dinilai manual by instructor/TA.
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
  const updates: Array<{ id: string; score: number | null; isBenar: boolean | null; manual: boolean }> = [];

  for (const qq of quizQuestions) {
    const points = qq.points_override !== null ? Number(qq.points_override) : Number(qq.question.points);
    const answer = answerByQuestion.get(qq.question_id);
    if (!answer) continue; // no dijawab = 0 points, no perlu grading manual
    if (['essay', 'file_upload'].includes(qq.question.type)) {
      butuhManual = true;
      updates.push({ id: answer.id, score: null, isBenar: null, manual: true });
      continue;
    }
    const graded = gradeSingleAnswer(qq.question.type, points, qq.options, answer.answer);
    totalSkor += graded.score;
    updates.push({ id: answer.id, score: graded.score, isBenar: graded.isBenar, manual: false });
  }

  await withTransaction(async (tx) => {
    for (const u of updates) {
      await assessmentsRepo.updateAnswerGrading(u.id, { earned_score: u.score, is_correct: u.isBenar, manually_graded: u.manual }, tx);
    }
    if (!butuhManual) {
      await assessmentsRepo.updateAttempt(attemptId, { status: 'graded', score: totalSkor }, tx);
      const existing = await repo.findGradeBySource('quiz', attemptId);
      if (existing) {
        await repo.updateGrade(existing.id, { score: totalSkor, score_maximum: Number(quiz.total_pointsts), graded_at: new Date() }, tx);
      } else {
        await repo.insertGrade(
          {
            enrollment_id: attempt.enrollment_id,
            source_type: 'quiz',
            source_id: attemptId,
            score: totalSkor,
            score_maximum: Number(quiz.total_pointsts) || 1,
            feedback: null,
            graded_by: null, // NULL = auto-grade sistem
          },
          tx,
        );
      }
    }
    // status tetap 'submitted' bila ada soal esai/upload_file menunggu grading manual.
  });

  if (!butuhManual) await recalcGradebook(attempt.enrollment_id);
}

// ── Manual grading (submission assignment) ───────────────────

export async function getSubmissionGrade(actor: AuthContext, submissionId: string) {
  const submission = await assessmentsRepo.submissionDetail(submissionId);
  if (!submission) throw AppError.notFound('Submission not found', 'submission.not_found');
  const assignment = await assessmentsRepo.assignmentDetail(submission.assignment_id);
  if (!assignment) throw AppError.notFound('Assignment not found', 'assignment.not_found');
  if (!isElevated(actor)) {
    const owns = await repo.isCourseOwnedByInstructor(assignment.course_id, actor.userId);
    const isOwnerStudent = submission.enrollment_id && actor.roles.includes('student');
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
  if (existing?.released_at) {
    throw AppError.conflict('This grade has already been released — use the adjustment endpointst', 'grading.released_use_adjust');
  }

  const feedback = input.feedback ?? null;
  const detailsFeedback = input.rubrik ? { rubrik: input.rubrik, notes: feedback } : feedback;

  let grade: repo.GradeRow;
  if (existing) {
    grade = await repo.updateGrade(existing.id, {
      score: input.score,
      score_maximum: input.score_maximum,
      feedback: JSON.stringify(detailsFeedback),
      graded_by: actor.userId,
      graded_at: new Date(),
    });
  } else {
    grade = await repo.insertGrade({
      enrollment_id: submission.enrollment_id,
      source_type: 'assignment',
      source_id: submissionId,
      score: input.score,
      score_maximum: input.score_maximum,
      feedback: JSON.stringify(detailsFeedback),
      graded_by: actor.userId,
    });
  }
  await assessmentsRepo.setSubmissionStatus(submissionId, 'graded');

  await recordAudit({
    userId: actor.userId,
    module: 'grading',
    action: existing ? 'update' : 'create',
    entity: 'grades',
    entityId: grade.id,
    before: existing ? { score: existing.score, score_maximum: existing.score_maximum } : null,
    after: { score: input.score, score_maximum: input.score_maximum },
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

  await assessmentsRepo.setSubmissionRevision(submissionId, input.notes);
  await recordAudit({
    userId: actor.userId,
    module: 'grading',
    action: 'request_revision',
    entity: 'submissions',
    entityId: submissionId,
    reason: input.notes,
  });
  // Student back to status "Belum" secara efektif melalui `submissions.status='revision_requested'`
  // (siklus submit ulang managed modul assessments — `resubmit()` menaikkan `revision_number`).
  return assessmentsRepo.submissionDetail(submissionId);
}

// ── Release & post-release adjustment ───────────────────

export async function releaseGrade(actor: AuthContext, gradeId: string, _input: ReleaseGradeInput) {
  const grade = await repo.gradeDetail(gradeId);
  if (!grade) throw AppError.notFound('Grade not found', 'grading.not_found');
  const courseId = await repo.courseIdForEnrollment(grade.enrollment_id);
  if (courseId) await assertCourseOwnership(actor, courseId);
  if (grade.released_at) throw AppError.conflict('This grade has already been released', 'grading.already_released');

  const released = await repo.releaseGrade(gradeId);
  await recordAudit({
    userId: actor.userId,
    module: 'grading',
    action: 'release',
    entity: 'grades',
    entityId: gradeId,
    before: { released_at: null },
    after: { released_at: released.released_at },
  });
  // Catatan: pemberitahuan rilis value to student ditangani modul notification,
  // bukan di sini — view domain 14-notification-reminder.
  return released;
}

/** Satu-satunya channel edit value pasca-rilis — no pernah menimpa diam-diam, selalu tercatat via recordAudit. */
export async function adjustGrade(actor: AuthContext, gradeId: string, input: AdjustGradeInput) {
  const grade = await repo.gradeDetail(gradeId);
  if (!grade) throw AppError.notFound('Grade not found', 'grading.not_found');
  if (!grade.released_at) throw AppError.badRequest('This grade has not been released yet — use the normal grading endpointst', 'grading.not_released_use_grading');
  const courseId = await repo.courseIdForEnrollment(grade.enrollment_id);
  if (courseId) await assertCourseOwnership(actor, courseId);

  const updated = await repo.updateGrade(gradeId, {
    score: input.score,
    score_maximum: input.score_maximum ?? grade.score_maximum,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'gradebook',
    action: 'adjust',
    entity: 'grades',
    entityId: gradeId,
    before: { score: grade.score, score_maximum: grade.score_maximum },
    after: { score: input.score, score_maximum: input.score_maximum ?? grade.score_maximum },
    reason: input.reason,
  });
  await recalcGradebook(grade.enrollment_id);
  return updated;
}

// ── Gradebook ────────────────────────────────────────────

export async function recalcGradebook(enrollmentId: string): Promise<void> {
  const grades = await repo.listGradesForEnrollment(enrollmentId);
  if (!grades.length) {
    await repo.upsertGradebookEntry({ enrollment_id: enrollmentId, final_grade: null, graduation_status: 'incomplete', details: [] });
    return;
  }
  const details = grades.map((g) => {
    const score = Number(g.score);
    const maks = Number(g.score_maximum) || 1;
    return { source_type: g.source_type, source_id: g.source_id, score, score_maximum: maks, persen: Math.round((score / maks) * 10000) / 100 };
  });
  const nilaiAkhir = Math.round((details.reduce((s, r) => s + r.persen, 0) / details.length) * 100) / 100;
  const status: repo.StatusKelulusan = nilaiAkhir >= DEFAULT_PASSING_SCORE ? 'passed' : 'failed';
  await repo.upsertGradebookEntry({ enrollment_id: enrollmentId, final_grade: nilaiAkhir, graduation_status: status, details });
}

export async function getGradebook(actor: AuthContext, courseId: string) {
  await assertCourseOwnership(actor, courseId);
  return repo.gradebookForCourse(courseId);
}
