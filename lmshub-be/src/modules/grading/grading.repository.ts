import { PoolClient } from 'pg';
import { query, queryOne, pool } from '../../core/db/pool';

export type SumberTipe = 'quiz' | 'assignment';
export type StatusKelulusan = 'lulus' | 'tidak_lulus' | 'belum_selesai';

export interface GradeRow {
  id: string;
  enrollment_id: string;
  sumber_tipe: SumberTipe;
  sumber_id: string;
  skor: string;
  skor_maksimal: string;
  feedback: string | null;
  dinilai_oleh: string | null;
  dinilai_at: string | null;
  /**
   * Waktu nilai dirilis ke siswa. Null berarti sudah dinilai tetapi belum
   * terlihat — itulah yang memungkinkan satu angkatan dinilai lalu dibuka
   * bersamaan. Setelah terisi, nilai terkunci: perubahan hanya lewat endpoint
   * penyesuaian yang mencatat alasan ke audit log.
   */
  rilis_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GradebookEntryRow {
  id: string;
  enrollment_id: string;
  nilai_akhir: string | null;
  status_kelulusan: StatusKelulusan;
  rincian: unknown;
  diperbarui_at: string;
  created_at: string;
  updated_at: string;
}

export async function findGradeBySource(sumberTipe: SumberTipe, sumberId: string): Promise<GradeRow | null> {
  return queryOne<GradeRow>(
    `SELECT * FROM grades WHERE sumber_tipe = $1 AND sumber_id = $2 AND deleted_at IS NULL`,
    [sumberTipe, sumberId],
  );
}

export async function gradeDetail(id: string): Promise<GradeRow | null> {
  return queryOne<GradeRow>(`SELECT * FROM grades WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertGrade(
  data: {
    enrollment_id: string;
    sumber_tipe: SumberTipe;
    sumber_id: string;
    skor: number;
    skor_maksimal: number;
    feedback: string | null;
    dinilai_oleh: string | null;
  },
  tx?: PoolClient,
): Promise<GradeRow> {
  const runner = tx ?? pool;
  const res = await runner.query<GradeRow>(
    `INSERT INTO grades (enrollment_id, sumber_tipe, sumber_id, skor, skor_maksimal, feedback, dinilai_oleh, dinilai_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING *`,
    [data.enrollment_id, data.sumber_tipe, data.sumber_id, data.skor, data.skor_maksimal, data.feedback, data.dinilai_oleh],
  );
  return res.rows[0];
}

export async function updateGrade(
  id: string,
  fields: Record<string, unknown>,
  tx?: PoolClient,
): Promise<GradeRow> {
  const runner = tx ?? pool;
  const keys = Object.keys(fields);
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const res = await runner.query<GradeRow>(
    `UPDATE grades SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => fields[k])],
  );
  return res.rows[0];
}

export async function releaseGrade(id: string): Promise<GradeRow> {
  const row = await queryOne<GradeRow>(`UPDATE grades SET rilis_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [id]);
  return row!;
}

export async function listGradesForEnrollment(enrollmentId: string): Promise<GradeRow[]> {
  return query<GradeRow>(`SELECT * FROM grades WHERE enrollment_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [enrollmentId]);
}

export async function gradebookEntry(enrollmentId: string): Promise<GradebookEntryRow | null> {
  return queryOne<GradebookEntryRow>(`SELECT * FROM gradebook_entries WHERE enrollment_id = $1 AND deleted_at IS NULL`, [enrollmentId]);
}

export async function upsertGradebookEntry(data: {
  enrollment_id: string;
  nilai_akhir: number | null;
  status_kelulusan: StatusKelulusan;
  rincian: unknown;
}): Promise<GradebookEntryRow> {
  const row = await queryOne<GradebookEntryRow>(
    `INSERT INTO gradebook_entries (enrollment_id, nilai_akhir, status_kelulusan, rincian, diperbarui_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (enrollment_id) DO UPDATE SET
       nilai_akhir = EXCLUDED.nilai_akhir,
       status_kelulusan = EXCLUDED.status_kelulusan,
       rincian = EXCLUDED.rincian,
       diperbarui_at = now(),
       updated_at = now()
     RETURNING *`,
    [data.enrollment_id, data.nilai_akhir, data.status_kelulusan, JSON.stringify(data.rincian)],
  );
  return row!;
}

export interface GradebookRowForCourse {
  enrollment_id: string;
  user_id: string;
  nama_lengkap: string;
  nilai_akhir: string | null;
  status_kelulusan: StatusKelulusan | null;
  rincian: unknown;
  diperbarui_at: string | null;
}

export async function gradebookForCourse(courseId: string): Promise<GradebookRowForCourse[]> {
  return query<GradebookRowForCourse>(
    `SELECT e.id AS enrollment_id, e.user_id, u.nama_lengkap,
            ge.nilai_akhir, ge.status_kelulusan, ge.rincian, ge.diperbarui_at
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN gradebook_entries ge ON ge.enrollment_id = e.id AND ge.deleted_at IS NULL
      WHERE e.course_id = $1 AND e.deleted_at IS NULL
      ORDER BY u.nama_lengkap`,
    [courseId],
  );
}

export async function courseIdForEnrollment(enrollmentId: string): Promise<string | null> {
  const row = await queryOne<{ course_id: string }>(`SELECT course_id FROM enrollments WHERE id = $1`, [enrollmentId]);
  return row?.course_id ?? null;
}

/** Cek instruktur pemilik kursus terkait sebuah enrollment (row-level grading/gradebook). */
export async function isCourseOwnedByInstructor(courseId: string, userId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM courses c JOIN instructor_profiles ip ON ip.id = c.instructor_id
        WHERE c.id = $1 AND ip.user_id = $2
     ) AS ok`,
    [courseId, userId],
  );
  return row?.ok ?? false;
}

// ── Antrian penilaian (submissions lintas kursus) ──────────────
export interface SubmissionQueueRow {
  id: string;
  status: string;
  jenis: string;
  tanggal_kumpul: string | null;
  revisi_ke: number;
  siswa_nama: string;
  judul_asesmen: string;
  course_id: string;
  kursus_judul: string;
}

export async function listSubmissionsQueue(
  p: { limit: number; offset: number },
  f: { status?: string; instructorUserId?: string | null },
): Promise<{ rows: SubmissionQueueRow[]; total: number }> {
  const where: string[] = ['s.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.status) {
    params.push(f.status);
    where.push(`s.status = $${params.length}`);
  }
  if (f.instructorUserId) {
    params.push(f.instructorUserId);
    where.push(`c.instructor_id IN (SELECT id FROM instructor_profiles WHERE user_id = $${params.length} AND deleted_at IS NULL)`);
  }
  const whereSql = where.join(' AND ');
  const rows = await query<SubmissionQueueRow>(
    `SELECT s.id, s.status, 'tugas' AS jenis, s.dikumpulkan_at AS tanggal_kumpul, s.revisi_ke,
            u.nama_lengkap AS siswa_nama, a.judul AS judul_asesmen,
            c.id AS course_id, c.judul AS kursus_judul
       FROM submissions s
       JOIN enrollments e ON e.id = s.enrollment_id
       JOIN users u ON u.id = e.user_id
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
      WHERE ${whereSql}
      ORDER BY s.dikumpulkan_at DESC NULLS LAST
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count
       FROM submissions s
       JOIN enrollments e ON e.id = s.enrollment_id
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
      WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}
