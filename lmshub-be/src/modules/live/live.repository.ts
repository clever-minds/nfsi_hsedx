import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

export interface LiveSessionRow {
  id: string;
  course_id: string | null;
  cohort_id: string | null;
  judul: string;
  deskripsi: string | null;
  penyedia: 'zoom' | 'bbb' | 'meet';
  url_join: string;
  host_user_id: string;
  waktu_mulai: string;
  waktu_selesai: string;
  kapasitas_maks: number | null;
  toleransi_terlambat_menit: number;
  status: 'dijadwalkan' | 'berlangsung' | 'selesai' | 'rekaman_tersedia';
  dibuat_oleh: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionAttendanceRow {
  id: string;
  live_session_id: string;
  user_id: string;
  status: 'belum' | 'hadir' | 'terlambat' | 'absen';
  waktu_join: string | null;
  waktu_leave: string | null;
  durasi_hadir_menit: number;
  ditandai_manual: boolean;
  ditandai_oleh: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingRow {
  id: string;
  live_session_id: string;
  url: string;
  durasi_menit: number | null;
  ukuran_bytes: string | null;
  status_jadi_materi: boolean;
  lesson_id: string | null;
  retensi_hingga: string | null;
  diunggah_oleh: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Baris daftar sesi = kolom tabel + kolom turunan dari join. Nama kursus dan
 * host tidak ada di `live_sessions`; keduanya wajib di-join, kalau tidak klien
 * hanya menerima id dan menampilkan "—".
 */
export interface LiveSessionListRow extends LiveSessionRow {
  kursus_judul: string | null;
  host_nama: string | null;
  jumlah_hadir: number;
}

export interface CalendarEventRow {
  id: string;
  sumber: 'live_session' | 'tugas' | 'kuis' | 'lainnya';
  source_id: string | null;
  course_id: string | null;
  judul: string;
  waktu_mulai: string;
  waktu_selesai: string | null;
  is_sepanjang_hari: boolean;
  meta: unknown;
  kursus_judul: string | null;
}

export interface ListFilters {
  course_id?: string;
  cohort_id?: string;
  status?: string;
  studentUserId?: string | null; // batasi ke sesi kursus yang diikuti siswa
  instructorUserId?: string | null; // batasi ke sesi kursus/host miliknya
}

export async function list(p: PageParams, f: ListFilters): Promise<{ rows: LiveSessionListRow[]; total: number }> {
  const where: string[] = ['ls.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  // ganti tiap kemunculan $? dengan placeholder posisi berbeda, sesuai urutan value
  const addMulti = (clause: string, vals: unknown[]) => {
    let sql = clause;
    for (const v of vals) {
      params.push(v);
      sql = sql.replace('$?', `$${params.length}`);
    }
    where.push(sql);
  };
  if (f.course_id) add('ls.course_id = $?', f.course_id);
  if (f.cohort_id) add('ls.cohort_id = $?', f.cohort_id);
  if (f.status) add('ls.status = $?', f.status);
  if (f.studentUserId) {
    addMulti(
      `(EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ls.course_id AND e.user_id = $? AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif'))
        OR EXISTS (SELECT 1 FROM cohort_members cm WHERE cm.cohort_id = ls.cohort_id AND cm.user_id = $?))`,
      [f.studentUserId, f.studentUserId],
    );
  }
  if (f.instructorUserId) {
    addMulti(
      `(ls.host_user_id = $? OR EXISTS (
          SELECT 1 FROM courses c JOIN instructor_profiles ip ON ip.id = c.instructor_id
           WHERE c.id = ls.course_id AND ip.user_id = $?))`,
      [f.instructorUserId, f.instructorUserId],
    );
  }
  const whereSql = where.join(' AND ');
  const sortCol = ['waktu_mulai', 'status', 'created_at'].includes(p.sort ?? '') ? p.sort : 'waktu_mulai';

  // LEFT JOIN, bukan JOIN: sesi boleh tidak terikat kursus (course_id nullable),
  // dan INNER JOIN akan membuangnya dari daftar.
  const rows = await query<LiveSessionListRow>(
    `SELECT ls.*,
            c.judul AS kursus_judul,
            u.nama_lengkap AS host_nama,
            (SELECT COUNT(*)::int FROM session_attendance sa WHERE sa.live_session_id = ls.id) AS jumlah_hadir
       FROM live_sessions ls
       LEFT JOIN courses c ON c.id = ls.course_id
       LEFT JOIN users u ON u.id = ls.host_user_id
      WHERE ${whereSql}
      ORDER BY ls.${sortCol} ${p.order}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM live_sessions ls WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function detail(id: string): Promise<LiveSessionRow | null> {
  return queryOne<LiveSessionRow>(`SELECT * FROM live_sessions WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insert(data: {
  course_id: string | null;
  cohort_id: string | null;
  judul: string;
  deskripsi: string | null;
  penyedia: string;
  url_join: string;
  host_user_id: string;
  waktu_mulai: string;
  waktu_selesai: string;
  kapasitas_maks: number | null;
  toleransi_terlambat_menit: number;
  dibuat_oleh: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO live_sessions
       (course_id, cohort_id, judul, deskripsi, penyedia, url_join, host_user_id,
        waktu_mulai, waktu_selesai, kapasitas_maks, toleransi_terlambat_menit, dibuat_oleh)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      data.course_id,
      data.cohort_id,
      data.judul,
      data.deskripsi,
      data.penyedia,
      data.url_join,
      data.host_user_id,
      data.waktu_mulai,
      data.waktu_selesai,
      data.kapasitas_maks,
      data.toleransi_terlambat_menit,
      data.dibuat_oleh,
    ],
  );
  return row!;
}

export async function update(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE live_sessions SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function setStatus(id: string, status: string): Promise<void> {
  await query(`UPDATE live_sessions SET status = $2 WHERE id = $1`, [id, status]);
}

export async function softDelete(id: string): Promise<void> {
  await query(`UPDATE live_sessions SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function isInstructorOfSession(sessionId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM live_sessions ls
        LEFT JOIN courses c ON c.id = ls.course_id
        LEFT JOIN instructor_profiles ip ON ip.id = c.instructor_id
       WHERE ls.id = $1 AND (ls.host_user_id = $2 OR ip.user_id = $2)
     ) AS ok`,
    [sessionId, userId],
  );
  return row?.ok ?? false;
}

export async function isEnrolledOrMember(session: LiveSessionRow, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = $2 AND e.user_id = $1 AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif'))
       OR EXISTS (SELECT 1 FROM cohort_members cm WHERE cm.cohort_id = $3 AND cm.user_id = $1)
     ) AS ok`,
    [userId, session.course_id, session.cohort_id],
  );
  return row?.ok ?? false;
}

// ── Attendance ──────────────────────────────────────────

export async function listAttendance(liveSessionId: string): Promise<SessionAttendanceRow[]> {
  return query<SessionAttendanceRow>(
    `SELECT * FROM session_attendance WHERE live_session_id = $1 ORDER BY created_at ASC`,
    [liveSessionId],
  );
}

export async function getAttendance(liveSessionId: string, userId: string): Promise<SessionAttendanceRow | null> {
  return queryOne<SessionAttendanceRow>(
    `SELECT * FROM session_attendance WHERE live_session_id = $1 AND user_id = $2`,
    [liveSessionId, userId],
  );
}

export async function upsertAttendance(data: {
  live_session_id: string;
  user_id: string;
  status: string;
  waktu_join: string | null;
  waktu_leave: string | null;
  durasi_hadir_menit: number;
  ditandai_manual: boolean;
  ditandai_oleh: string | null;
}): Promise<SessionAttendanceRow> {
  const row = await queryOne<SessionAttendanceRow>(
    `INSERT INTO session_attendance
       (live_session_id, user_id, status, waktu_join, waktu_leave, durasi_hadir_menit, ditandai_manual, ditandai_oleh)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (live_session_id, user_id) DO UPDATE SET
       status = EXCLUDED.status,
       waktu_join = COALESCE(EXCLUDED.waktu_join, session_attendance.waktu_join),
       waktu_leave = COALESCE(EXCLUDED.waktu_leave, session_attendance.waktu_leave),
       durasi_hadir_menit = EXCLUDED.durasi_hadir_menit,
       ditandai_manual = EXCLUDED.ditandai_manual,
       ditandai_oleh = EXCLUDED.ditandai_oleh,
       updated_at = now()
     RETURNING *`,
    [
      data.live_session_id,
      data.user_id,
      data.status,
      data.waktu_join,
      data.waktu_leave,
      data.durasi_hadir_menit,
      data.ditandai_manual,
      data.ditandai_oleh,
    ],
  );
  return row!;
}

export async function batchMarkAbsen(liveSessionId: string, courseId: string | null, cohortId: string | null) {
  await query(
    `INSERT INTO session_attendance (live_session_id, user_id, status, durasi_hadir_menit, ditandai_manual)
     SELECT $1, roster.user_id, 'absen', 0, false
       FROM (
         SELECT user_id FROM enrollments WHERE course_id = $2 AND deleted_at IS NULL AND status IN ('terdaftar','aktif')
         UNION
         SELECT user_id FROM cohort_members WHERE cohort_id = $3
       ) roster
      WHERE NOT EXISTS (
        SELECT 1 FROM session_attendance sa WHERE sa.live_session_id = $1 AND sa.user_id = roster.user_id
      )`,
    [liveSessionId, courseId, cohortId],
  );
}

// ── Recordings ──────────────────────────────────────────

export async function insertRecording(data: {
  live_session_id: string;
  url: string;
  durasi_menit: number | null;
  ukuran_bytes: number | null;
  retensi_hingga: string | null;
  diunggah_oleh: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO recordings (live_session_id, url, durasi_menit, ukuran_bytes, retensi_hingga, diunggah_oleh)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [data.live_session_id, data.url, data.durasi_menit, data.ukuran_bytes, data.retensi_hingga, data.diunggah_oleh],
  );
  return row!;
}

export async function listRecordings(liveSessionId: string): Promise<RecordingRow[]> {
  return query<RecordingRow>(
    `SELECT * FROM recordings WHERE live_session_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [liveSessionId],
  );
}

export async function getRecording(id: string): Promise<RecordingRow | null> {
  return queryOne<RecordingRow>(`SELECT * FROM recordings WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function publishRecordingAsLesson(id: string, lessonId: string): Promise<void> {
  await query(`UPDATE recordings SET status_jadi_materi = true, lesson_id = $2 WHERE id = $1`, [id, lessonId]);
}

// ── Calendar ────────────────────────────────────────────

export async function upsertCalendarEvent(data: {
  sumber: string;
  source_id: string;
  course_id: string | null;
  judul: string;
  waktu_mulai: string;
  waktu_selesai: string | null;
}): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM calendar_events WHERE sumber = $1 AND source_id = $2 AND deleted_at IS NULL`,
    [data.sumber, data.source_id],
  );
  if (existing) {
    await query(
      `UPDATE calendar_events SET course_id = $3, judul = $4, waktu_mulai = $5, waktu_selesai = $6, updated_at = now()
        WHERE id = $1 AND sumber = $2`,
      [existing.id, data.sumber, data.course_id, data.judul, data.waktu_mulai, data.waktu_selesai],
    );
    return;
  }
  await query(
    `INSERT INTO calendar_events (sumber, source_id, course_id, judul, waktu_mulai, waktu_selesai)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [data.sumber, data.source_id, data.course_id, data.judul, data.waktu_mulai, data.waktu_selesai],
  );
}

export async function aggregateCalendar(
  userId: string,
  filters: { course_id?: string; from?: string; to?: string },
): Promise<CalendarEventRow[]> {
  const where: string[] = [
    'ce.deleted_at IS NULL',
    `(ce.course_id IS NULL
      OR EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ce.course_id AND e.user_id = $1 AND e.deleted_at IS NULL AND e.status IN ('terdaftar','aktif'))
      OR EXISTS (SELECT 1 FROM courses c JOIN instructor_profiles ip ON ip.id = c.instructor_id WHERE c.id = ce.course_id AND ip.user_id = $1))`,
  ];
  const params: unknown[] = [userId];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (filters.course_id) add('ce.course_id = $?', filters.course_id);
  if (filters.from) add('ce.waktu_mulai >= $?', filters.from);
  if (filters.to) add('ce.waktu_mulai <= $?', filters.to);

  return query<CalendarEventRow>(
    `SELECT ce.*, c.judul AS kursus_judul
       FROM calendar_events ce
       LEFT JOIN courses c ON c.id = ce.course_id
      WHERE ${where.join(' AND ')}
      ORDER BY ce.waktu_mulai ASC`,
    params,
  );
}
