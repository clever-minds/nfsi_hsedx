import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './live.repository';
import {
  CreateLiveSessionInput,
  UpdateLiveSessionInput,
  MarkAttendanceInput,
  CreateRecordingInput,
} from './live.validation';

const isSuper = (actor: AuthContext) => actor.permissions.has('*');

async function assertManage(actor: AuthContext, sessionId: string): Promise<void> {
  if (isSuper(actor)) return;
  const ok = await repo.isInstructorOfSession(sessionId, actor.userId);
  if (!ok) throw AppError.forbidden('Only the course instructor or the session host can manage this session', 'live.manage_requires_instructor_or_host');
}

export async function list(actor: AuthContext, p: PageParams, filters: { course_id?: string; cohort_id?: string; status?: string }) {
  const isStudentOnly = !isSuper(actor) && !actor.permissions.has('live_class.update');
  // Student: hanya scope enrollment/cohort. Instructor (punya live_class.update, bukan super):
  // hanya scope host/pemilik course. Super: tanpa scope. Kedua filter no boleh
  // dipasang bersamaan untuk student (akan ter-AND dan mengosongkan hasil).
  return repo.list(p, {
    ...filters,
    studentUserId: isStudentOnly ? actor.userId : null,
    instructorUserId: !isSuper(actor) && !isStudentOnly ? actor.userId : null,
  });
}

export async function detail(actor: AuthContext, id: string) {
  const session = await repo.detail(id);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  if (!isSuper(actor)) {
    const manages = await repo.isInstructorOfSession(id, actor.userId);
    const enrolled = manages ? true : await repo.isEnrolledOrMember(session, actor.userId);
    if (!manages && !enrolled) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  }
  const attendance = await repo.listAttendance(id);
  return { ...session, attendance };
}

export async function schedule(actor: AuthContext, input: CreateLiveSessionInput) {
  const { id } = await repo.insert({
    course_id: input.course_id ?? null,
    cohort_id: input.cohort_id ?? null,
    title: input.title,
    description: input.description ?? null,
    provider: input.provider,
    url_join: input.url_join,
    host_user_id: input.host_user_id,
    start_time: input.start_time,
    end_time: input.end_time,
    kapasitas_maks: input.kapasitas_maks ?? null,
    toleransi_terlambat_menit: input.toleransi_terlambat_menit,
    created_by: actor.userId,
  });
  await repo.upsertCalendarEvent({
    source: 'live_session',
    source_id: id,
    course_id: input.course_id ?? null,
    title: input.title,
    start_time: input.start_time,
    end_time: input.end_time,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'live_class',
    action: 'schedule',
    entity: 'live_sessions',
    entityId: id,
    after: input,
  });
  return repo.detail(id);
}

export async function update(actor: AuthContext, id: string, input: UpdateLiveSessionInput) {
  const before = await repo.detail(id);
  if (!before) throw AppError.notFound('Live session not found', 'live.session_not_found');
  await assertManage(actor, id);
  if (before.status !== 'scheduled') {
    throw AppError.conflict('Only a scheduled session can be changed', 'live.only_scheduled_editable');
  }
  const fields: Record<string, unknown> = {};
  for (const k of ['title', 'description', 'provider', 'url_join', 'start_time', 'end_time', 'kapasitas_maks', 'toleransi_terlambat_menit'] as const) {
    if (input[k] !== undefined) fields[k] = input[k];
  }
  await repo.update(id, fields);
  if (input.start_time || input.end_time) {
    await repo.upsertCalendarEvent({
      source: 'live_session',
      source_id: id,
      course_id: before.course_id,
      title: input.title ?? before.title,
      start_time: input.start_time ?? before.start_time,
      end_time: input.end_time ?? before.end_time,
    });
  }
  await recordAudit({
    userId: actor.userId,
    module: 'live_class',
    action: 'update',
    entity: 'live_sessions',
    entityId: id,
    before,
    after: input,
  });
  return repo.detail(id);
}

export async function cancel(actor: AuthContext, id: string) {
  const session = await repo.detail(id);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  await assertManage(actor, id);
  if (session.status === 'ongoing' || session.status === 'completed' || session.status === 'recording_available') {
    throw AppError.conflict('A session that has started or finished cannot be cancelled', 'live.cannot_cancel_started');
  }
  await repo.softDelete(id);
  await recordAudit({
    userId: actor.userId,
    module: 'live_class',
    action: 'cancel',
    entity: 'live_sessions',
    entityId: id,
    before: { status: session.status },
  });
}

export async function start(actor: AuthContext, id: string) {
  const session = await repo.detail(id);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  await assertManage(actor, id);
  if (session.status !== 'scheduled') throw AppError.conflict('This session is not in a scheduled state', 'live.not_scheduled');
  await repo.setStatus(id, 'ongoing');
  await recordAudit({ userId: actor.userId, module: 'live_class', action: 'start', entity: 'live_sessions', entityId: id });
  return repo.detail(id);
}

export async function end(actor: AuthContext, id: string) {
  const session = await repo.detail(id);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  await assertManage(actor, id);
  if (session.status !== 'ongoing') throw AppError.conflict('This session is not currently running', 'live.not_in_progress');
  await repo.setStatus(id, 'completed');
  // peserta terdaftar yang no pernah join otomatis ditandai absen
  await repo.batchMarkAbsen(id, session.course_id, session.cohort_id);
  await recordAudit({ userId: actor.userId, module: 'live_class', action: 'end', entity: 'live_sessions', entityId: id });
  return repo.detail(id);
}

// ── Attendance ──────────────────────────────────────────

export async function listAttendance(actor: AuthContext, sessionId: string) {
  const session = await repo.detail(sessionId);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  if (!isSuper(actor)) {
    const manages = await repo.isInstructorOfSession(sessionId, actor.userId);
    if (!manages) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  }
  return repo.listAttendance(sessionId);
}

export async function markAttendance(actor: AuthContext, sessionId: string, input: MarkAttendanceInput) {
  const session = await repo.detail(sessionId);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  await assertManage(actor, sessionId);
  const row = await repo.upsertAttendance({
    live_session_id: sessionId,
    user_id: input.user_id,
    status: input.status,
    time_join: null,
    time_leave: null,
    durasi_hadir_menit: input.durasi_hadir_menit ?? 0,
    ditandai_manual: true,
    ditandai_by: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'attendance',
    action: 'mark_manual',
    entity: 'session_attendance',
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function join(actor: AuthContext, sessionId: string) {
  const session = await repo.detail(sessionId);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  const isHost = session.host_user_id === actor.userId;
  if (!isHost && !isSuper(actor)) {
    const enrolled = await repo.isEnrolledOrMember(session, actor.userId);
    if (!enrolled) throw AppError.forbidden('You are not enrolled in the course or cohort for this session', 'live.not_in_session_cohort');
  }
  const now = new Date();
  const start = new Date(session.start_time);
  const finish = new Date(session.end_time);
  const toleransiMs = session.toleransi_terlambat_menit * 60_000;
  if (now < new Date(start.getTime() - 15 * 60_000) || now > finish) {
    throw AppError.badRequest('The join link only works shortly before and during the session', 'live.join_link_not_yet_active');
  }
  const status = now.getTime() > start.getTime() + toleransiMs ? 'late' : 'present';
  const row = await repo.upsertAttendance({
    live_session_id: sessionId,
    user_id: actor.userId,
    status,
    time_join: now.toISOString(),
    time_leave: null,
    durasi_hadir_menit: 0,
    ditandai_manual: false,
    ditandai_by: null,
  });
  return { url_join: session.url_join, attendance: row };
}

// ── Recordings ──────────────────────────────────────────

export async function listRecordings(actor: AuthContext, sessionId: string) {
  const session = await repo.detail(sessionId);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  if (!isSuper(actor)) {
    const manages = await repo.isInstructorOfSession(sessionId, actor.userId);
    const enrolled = manages ? true : await repo.isEnrolledOrMember(session, actor.userId);
    if (!manages && !enrolled) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  }
  return repo.listRecordings(sessionId);
}

export async function addRecording(actor: AuthContext, sessionId: string, input: CreateRecordingInput) {
  const session = await repo.detail(sessionId);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  await assertManage(actor, sessionId);
  const { id } = await repo.insertRecording({
    live_session_id: sessionId,
    url: input.url,
    duration_minutes: input.duration_minutes ?? null,
    size_bytes: input.size_bytes ?? null,
    retensi_hingga: input.retensi_hingga ?? null,
    diunggah_by: actor.userId,
  });
  if (session.status === 'completed') {
    await repo.setStatus(sessionId, 'recording_available');
  }
  await recordAudit({
    userId: actor.userId,
    module: 'live_class',
    action: 'recording_ingest',
    entity: 'recordings',
    entityId: id,
    after: input,
  });
  return repo.getRecording(id);
}

export async function publishAsLesson(actor: AuthContext, recordingId: string, lessonId: string) {
  const recording = await repo.getRecording(recordingId);
  if (!recording) throw AppError.notFound('Recording not found', 'live.recording_not_found');
  await assertManage(actor, recording.live_session_id);
  await repo.publishRecordingAsLesson(recordingId, lessonId);
  await recordAudit({
    userId: actor.userId,
    module: 'live_class',
    action: 'publish_as_lesson',
    entity: 'recordings',
    entityId: recordingId,
    after: { lesson_id: lessonId },
  });
  return repo.getRecording(recordingId);
}

// ── Calendar ────────────────────────────────────────────

export async function calendar(actor: AuthContext, filters: { course_id?: string; from?: string; to?: string }) {
  return repo.aggregateCalendar(actor.userId, filters);
}
