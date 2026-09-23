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
  // Siswa: hanya scope enrollment/cohort. Instruktur (punya live_class.update, bukan super):
  // hanya scope host/pemilik kursus. Super: tanpa scope. Kedua filter TIDAK boleh
  // dipasang bersamaan untuk siswa (akan ter-AND dan mengosongkan hasil).
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
    judul: input.judul,
    deskripsi: input.deskripsi ?? null,
    penyedia: input.penyedia,
    url_join: input.url_join,
    host_user_id: input.host_user_id,
    waktu_mulai: input.waktu_mulai,
    waktu_selesai: input.waktu_selesai,
    kapasitas_maks: input.kapasitas_maks ?? null,
    toleransi_terlambat_menit: input.toleransi_terlambat_menit,
    dibuat_oleh: actor.userId,
  });
  await repo.upsertCalendarEvent({
    sumber: 'live_session',
    source_id: id,
    course_id: input.course_id ?? null,
    judul: input.judul,
    waktu_mulai: input.waktu_mulai,
    waktu_selesai: input.waktu_selesai,
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
  if (before.status !== 'dijadwalkan') {
    throw AppError.conflict('Only a scheduled session can be changed', 'live.only_scheduled_editable');
  }
  const fields: Record<string, unknown> = {};
  for (const k of ['judul', 'deskripsi', 'penyedia', 'url_join', 'waktu_mulai', 'waktu_selesai', 'kapasitas_maks', 'toleransi_terlambat_menit'] as const) {
    if (input[k] !== undefined) fields[k] = input[k];
  }
  await repo.update(id, fields);
  if (input.waktu_mulai || input.waktu_selesai) {
    await repo.upsertCalendarEvent({
      sumber: 'live_session',
      source_id: id,
      course_id: before.course_id,
      judul: input.judul ?? before.judul,
      waktu_mulai: input.waktu_mulai ?? before.waktu_mulai,
      waktu_selesai: input.waktu_selesai ?? before.waktu_selesai,
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
  if (session.status === 'berlangsung' || session.status === 'selesai' || session.status === 'rekaman_tersedia') {
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
  if (session.status !== 'dijadwalkan') throw AppError.conflict('This session is not in a scheduled state', 'live.not_scheduled');
  await repo.setStatus(id, 'berlangsung');
  await recordAudit({ userId: actor.userId, module: 'live_class', action: 'start', entity: 'live_sessions', entityId: id });
  return repo.detail(id);
}

export async function end(actor: AuthContext, id: string) {
  const session = await repo.detail(id);
  if (!session) throw AppError.notFound('Live session not found', 'live.session_not_found');
  await assertManage(actor, id);
  if (session.status !== 'berlangsung') throw AppError.conflict('This session is not currently running', 'live.not_in_progress');
  await repo.setStatus(id, 'selesai');
  // peserta terdaftar yang tidak pernah join otomatis ditandai absen
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
    waktu_join: null,
    waktu_leave: null,
    durasi_hadir_menit: input.durasi_hadir_menit ?? 0,
    ditandai_manual: true,
    ditandai_oleh: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'kehadiran',
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
  const mulai = new Date(session.waktu_mulai);
  const selesai = new Date(session.waktu_selesai);
  const toleransiMs = session.toleransi_terlambat_menit * 60_000;
  if (now < new Date(mulai.getTime() - 15 * 60_000) || now > selesai) {
    throw AppError.badRequest('The join link only works shortly before and during the session', 'live.join_link_not_yet_active');
  }
  const status = now.getTime() > mulai.getTime() + toleransiMs ? 'terlambat' : 'hadir';
  const row = await repo.upsertAttendance({
    live_session_id: sessionId,
    user_id: actor.userId,
    status,
    waktu_join: now.toISOString(),
    waktu_leave: null,
    durasi_hadir_menit: 0,
    ditandai_manual: false,
    ditandai_oleh: null,
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
    durasi_menit: input.durasi_menit ?? null,
    ukuran_bytes: input.ukuran_bytes ?? null,
    retensi_hingga: input.retensi_hingga ?? null,
    diunggah_oleh: actor.userId,
  });
  if (session.status === 'selesai') {
    await repo.setStatus(sessionId, 'rekaman_tersedia');
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
