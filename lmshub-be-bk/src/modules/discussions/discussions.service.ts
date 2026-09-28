import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './discussions.repository';
import {
  CreateThreadInput,
  CreatePostInput,
  CreateQuestionInput,
  CreateAnswerInput,
  CreateCommentInput,
  ToggleReactionInput,
  CreateReportInput,
  ActOnReportInput,
} from './discussions.validation';

const isSuper = (actor: AuthContext) => actor.permissions.has('*');

const REPORT_ESCALATION_THRESHOLD = 3; // ambang eskalasi laporan menumpuk (default; idealnya dari settings)

async function assertCourseMember(actor: AuthContext, courseId: string): Promise<void> {
  if (isSuper(actor)) return;
  const member = await repo.isCourseMember(courseId, actor.userId);
  if (!member) throw AppError.forbidden('Only course members — enrolled students and the instructor — can open this discussion', 'discussion.members_only');
}

async function assertCourseInstructor(actor: AuthContext, courseId: string): Promise<void> {
  if (isSuper(actor)) return;
  const isInstructor = await repo.isCourseInstructor(courseId, actor.userId);
  if (!isInstructor) throw AppError.forbidden('Only the course instructor or an admin can do this', 'course.action_requires_instructor_or_admin');
}

// ── Threads ──────────────────────────────────────────────

export async function listThreads(actor: AuthContext, courseId: string, p: PageParams) {
  await assertCourseMember(actor, courseId);
  return repo.listThreads(courseId, p);
}

export async function threadDetail(actor: AuthContext, threadId: string) {
  const thread = await repo.getThread(threadId);
  if (!thread) throw AppError.notFound('Thread not found', 'discussion.thread_not_found');
  await assertCourseMember(actor, thread.course_id);
  const posts = await repo.listPosts(threadId);
  return { ...thread, posts };
}

export async function createThread(actor: AuthContext, courseId: string, input: CreateThreadInput) {
  await assertCourseMember(actor, courseId);
  const thread = await repo.insertThread({ course_id: courseId, judul: input.judul, dibuat_oleh: actor.userId });
  if (input.isi) {
    await repo.insertPost({ thread_id: thread.id, parent_post_id: null, user_id: actor.userId, isi: input.isi });
    await repo.incrementThreadPostCount(thread.id);
  }
  return threadDetail(actor, thread.id);
}

export async function reply(actor: AuthContext, threadId: string, input: CreatePostInput) {
  const thread = await repo.getThread(threadId);
  if (!thread) throw AppError.notFound('Thread not found', 'discussion.thread_not_found');
  await assertCourseMember(actor, thread.course_id);
  if (thread.is_locked) throw AppError.conflict('This thread is locked and is not accepting replies', 'discussion.thread_locked');
  if (input.parent_post_id) {
    const parent = await repo.getPost(input.parent_post_id);
    if (!parent || parent.thread_id !== threadId) throw AppError.badRequest('The parent post reference is not valid', 'discussion.invalid_parent_post');
  }
  const post = await repo.insertPost({
    thread_id: threadId,
    parent_post_id: input.parent_post_id ?? null,
    user_id: actor.userId,
    isi: input.isi,
  });
  await repo.incrementThreadPostCount(threadId);
  return post;
}

export async function pinThread(actor: AuthContext, threadId: string, pinned: boolean) {
  const thread = await repo.getThread(threadId);
  if (!thread) throw AppError.notFound('Thread not found', 'discussion.thread_not_found');
  await assertCourseInstructor(actor, thread.course_id);
  await repo.setThreadPin(threadId, pinned);
  await recordAudit({ userId: actor.userId, module: 'diskusi', action: pinned ? 'pin' : 'unpin', entity: 'discussion_threads', entityId: threadId });
  return repo.getThread(threadId);
}

export async function lockThread(actor: AuthContext, threadId: string, locked: boolean) {
  const thread = await repo.getThread(threadId);
  if (!thread) throw AppError.notFound('Thread not found', 'discussion.thread_not_found');
  await assertCourseInstructor(actor, thread.course_id);
  await repo.setThreadLock(threadId, locked);
  await recordAudit({ userId: actor.userId, module: 'diskusi', action: locked ? 'lock' : 'unlock', entity: 'discussion_threads', entityId: threadId });
  return repo.getThread(threadId);
}

// ── Q&A ──────────────────────────────────────────────────

export async function listQuestions(actor: AuthContext, lessonId: string, p: PageParams) {
  const courseId = await repo.courseIdOfLesson(lessonId);
  if (!courseId) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  await assertCourseMember(actor, courseId);
  return repo.listQuestions(lessonId, p);
}

export async function askQuestion(actor: AuthContext, lessonId: string, input: CreateQuestionInput) {
  const courseId = await repo.courseIdOfLesson(lessonId);
  if (!courseId) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  await assertCourseMember(actor, courseId);
  return repo.insertQuestion({ lesson_id: lessonId, user_id: actor.userId, isi: input.isi });
}

export async function answerQuestion(actor: AuthContext, questionId: string, input: CreateAnswerInput) {
  const question = await repo.getQuestion(questionId);
  if (!question) throw AppError.notFound('Question not found', 'qa.question_not_found');
  const courseId = await repo.courseIdOfLesson(question.lesson_id);
  if (!courseId) throw AppError.notFound('Lesson not found', 'lesson.not_found');
  await assertCourseMember(actor, courseId);
  const isInstructor = isSuper(actor) || (await repo.isCourseInstructor(courseId, actor.userId));
  const answer = await repo.insertAnswer({
    question_id: questionId,
    user_id: actor.userId,
    isi: input.isi,
    is_instruktur_jawaban: isInstructor,
  });
  // "status_terjawab" true begitu >=1 jawaban masuk (aturan bisnis domain 07)
  if (!question.status_terjawab) {
    await repo.setQuestionAnswered(questionId, true);
  }
  return answer;
}

export async function markQuestionTerjawab(actor: AuthContext, questionId: string, terjawab: boolean) {
  const question = await repo.getQuestion(questionId);
  if (!question) throw AppError.notFound('Question not found', 'qa.question_not_found');
  const courseId = await repo.courseIdOfLesson(question.lesson_id);
  if (courseId) {
    const isOwner = question.user_id === actor.userId;
    const isInstructor = isSuper(actor) || (await repo.isCourseInstructor(courseId, actor.userId));
    if (!isOwner && !isInstructor) throw AppError.forbidden('Only the person who asked or the instructor can change this status', 'qa.status_requires_asker_or_instructor');
  }
  await repo.setQuestionAnswered(questionId, terjawab);
  return repo.getQuestion(questionId);
}

// ── Upvote (via reactions) ────────────────────────────────

export async function upvoteQuestion(actor: AuthContext, questionId: string) {
  const question = await repo.getQuestion(questionId);
  if (!question) throw AppError.notFound('Question not found', 'qa.question_not_found');
  return toggleUpvote(actor, 'qa_question', questionId, 'qa_questions');
}

export async function upvoteAnswer(actor: AuthContext, answerId: string) {
  const answer = await repo.getAnswer(answerId);
  if (!answer) throw AppError.notFound('Answer not found', 'qa.answer_not_found');
  return toggleUpvote(actor, 'qa_answer', answerId, 'qa_answers');
}

async function toggleUpvote(actor: AuthContext, targetType: string, targetId: string, table: 'qa_questions' | 'qa_answers') {
  const existing = await repo.findReaction(targetType, targetId, actor.userId);
  if (existing) {
    await repo.deleteReaction(existing.id);
    await repo.incrementUpvote(table, targetId, -1);
    return { upvoted: false };
  }
  await repo.insertReaction({ target_type: targetType, target_id: targetId, user_id: actor.userId, jenis: 'suka' });
  await repo.incrementUpvote(table, targetId, 1);
  return { upvoted: true };
}

// ── Comments & generic reactions ──────────────────────────

export async function createComment(actor: AuthContext, input: CreateCommentInput) {
  const courseId = await repo.courseIdOfTarget(input.target_type, input.target_id);
  if (courseId) await assertCourseMember(actor, courseId);
  return repo.insertComment({
    target_type: input.target_type,
    target_id: input.target_id,
    user_id: actor.userId,
    isi: input.isi,
  });
}

export async function toggleReaction(actor: AuthContext, input: ToggleReactionInput) {
  const courseId = await repo.courseIdOfTarget(input.target_type, input.target_id);
  if (courseId) await assertCourseMember(actor, courseId);
  const existing = await repo.findReaction(input.target_type, input.target_id, actor.userId);
  if (existing && existing.jenis === input.jenis) {
    await repo.deleteReaction(existing.id);
    return { reacted: false };
  }
  if (existing) {
    await repo.deleteReaction(existing.id);
  }
  const row = await repo.insertReaction({
    target_type: input.target_type,
    target_id: input.target_id,
    user_id: actor.userId,
    jenis: input.jenis,
  });
  return { reacted: true, reaction: row };
}

// ── Moderasi ───────────────────────────────────────────────

export async function createReport(actor: AuthContext, input: CreateReportInput) {
  const duplicate = await repo.findDuplicateReport(input.target_type, input.target_id, actor.userId);
  if (duplicate) throw AppError.conflict('You have already reported this content and it is still under review', 'moderation.already_reported');
  const report = await repo.insertReport({
    target_type: input.target_type,
    target_id: input.target_id,
    pelapor_user_id: actor.userId,
    alasan: input.alasan,
  });
  const pendingCount = await repo.countPendingReportsForTarget(input.target_type, input.target_id);
  const escalated = pendingCount >= REPORT_ESCALATION_THRESHOLD;
  if (escalated) {
    await recordAudit({
      userId: actor.userId,
      module: 'diskusi',
      action: 'moderation_escalated',
      entity: 'moderation_reports',
      entityId: report.id,
      after: { target_type: input.target_type, target_id: input.target_id, pendingCount },
    });
  }
  return { ...report, escalated };
}

export async function listReports(actor: AuthContext, p: PageParams, status?: string) {
  if (!isSuper(actor) && !actor.permissions.has('diskusi.view')) {
    throw AppError.forbidden('You need the discussion.view permission', 'permission.discussion_view_required');
  }
  return repo.listReports(p, status);
}

export async function actOnReport(actor: AuthContext, reportId: string, input: ActOnReportInput) {
  const report = await repo.getReport(reportId);
  if (!report) throw AppError.notFound('Report not found', 'report.not_found');
  const updated = await repo.actOnReport(reportId, {
    status: input.status,
    tindakan: input.tindakan ?? null,
    ditangani_oleh: actor.userId,
    catatan_penanganan: input.catatan_penanganan ?? null,
  });
  if (input.status === 'ditindak' && input.tindakan) {
    if (input.tindakan === 'sembunyikan') {
      await repo.hideTarget(report.target_type, report.target_id, input.catatan_penanganan ?? null);
    } else if (input.tindakan === 'hapus') {
      await repo.softDeleteTarget(report.target_type, report.target_id);
    }
    // 'blokir_pengguna' dicatat sebagai efek pada moderation_reports.tindakan; penegakan akses forum
    // dilakukan aplikasi di layer lain (tidak ada tabel blocked_users terpisah pada rilis awal).
  }
  await recordAudit({
    userId: actor.userId,
    module: 'diskusi',
    action: 'moderation_act',
    entity: 'moderation_reports',
    entityId: reportId,
    before: { status: report.status },
    after: { status: input.status, tindakan: input.tindakan },
    reason: input.catatan_penanganan ?? null,
  });
  return updated;
}
