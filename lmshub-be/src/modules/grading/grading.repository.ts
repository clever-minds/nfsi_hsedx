import { PoolClient } from 'pg';
import { query, queryOne, pool } from '../../core/db/pool';

export type SumberTipe = 'quiz' | 'assignment';
export type StatusKelulusan = 'passed' | 'failed' | 'incomplete';

export interface GradeRow {
  id: string;
  enrollment_id: string;
  source_type: SumberTipe;
  source_id: string;
  score: string;
  score_maximum: string;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  /**
   * time value dirilis to student. Null berarti sudah dinilai tetapi belum
   * terlihat — itulah yang memungkinkan satu angkatan dinilai lalu dibuka
   * bersamaan. Setelah terisi, value terkunci: perubahan hanya lewat endpointst
   * penyesuaian yang mencatat reason to audit log.
   */
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GradebookEntryRow {
  id: string;
  enrollment_id: string;
  final_grade: string | null;
  graduation_status: StatusKelulusan;
  details: unknown;
  updated_at_custom: string;
  created_at: string;
  updated_at: string;
}

export async function findGradeBySource(sumberTipe: SumberTipe, sumberId: string): Promise<GradeRow | null> {
  return queryOne<GradeRow>(
    `SELECT * FROM grades WHERE source_type = $1 AND source_id = $2 AND deleted_at IS NULL`,
    [sumberTipe, sumberId],
  );
}

export async function gradeDetail(id: string): Promise<GradeRow | null> {
  return queryOne<GradeRow>(`SELECT * FROM grades WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertGrade(
  data: {
    enrollment_id: string;
    source_type: SumberTipe;
    source_id: string;
    score: number;
    score_maximum: number;
    feedback: string | null;
    graded_by: string | null;
  },
  tx?: PoolClient,
): Promise<GradeRow> {
  const runner = tx ?? pool;
  const res = await runner.query<GradeRow>(
    `INSERT INTO grades (enrollment_id, source_type, source_id, score, score_maximum, feedback, graded_by, graded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING *`,
    [data.enrollment_id, data.source_type, data.source_id, data.score, data.score_maximum, data.feedback, data.graded_by],
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
  const row = await queryOne<GradeRow>(`UPDATE grades SET released_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [id]);
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
  final_grade: number | null;
  graduation_status: StatusKelulusan;
  details: unknown;
}): Promise<GradebookEntryRow> {
  const row = await queryOne<GradebookEntryRow>(
    `INSERT INTO gradebook_entries (enrollment_id, final_grade, graduation_status, details, updated_at_custom)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (enrollment_id) DO UPDATE SET
       final_grade = EXCLUDED.final_grade,
       graduation_status = EXCLUDED.graduation_status,
       details = EXCLUDED.details,
       updated_at_custom = now(),
       updated_at = now()
     RETURNING *`,
    [data.enrollment_id, data.final_grade, data.graduation_status, JSON.stringify(data.details)],
  );
  return row!;
}

export interface GradebookRowForCourse {
  enrollment_id: string;
  user_id: string;
  name_lengkap: string;
  final_grade: string | null;
  graduation_status: StatusKelulusan | null;
  details: unknown;
  updated_at_custom: string | null;
}

export async function gradebookForCourse(courseId: string): Promise<GradebookRowForCourse[]> {
  return query<GradebookRowForCourse>(
    `SELECT e.id AS enrollment_id, e.user_id, u.name_lengkap,
            ge.final_grade, ge.graduation_status, ge.details, ge.updated_at_custom
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN gradebook_entries ge ON ge.enrollment_id = e.id AND ge.deleted_at IS NULL
      WHERE e.course_id = $1 AND e.deleted_at IS NULL
      ORDER BY u.name_lengkap`,
    [courseId],
  );
}

export async function courseIdForEnrollment(enrollmentId: string): Promise<string | null> {
  const row = await queryOne<{ course_id: string }>(`SELECT course_id FROM enrollments WHERE id = $1`, [enrollmentId]);
  return row?.course_id ?? null;
}

/** Cek instructor pemilik course terkait sebuah enrollment (row-level grading/gradebook). */
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

// ── Antrian penilaian (submissions lintas course) ──────────────
export interface SubmissionQueueRow {
  id: string;
  status: string;
  type: string;
  date_kumpul: string | null;
  revision_number: number;
  siswa_name: string;
  title_asesmen: string;
  course_id: string;
  course_title: string;
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
    `SELECT s.id, s.status, 'assignment' AS type, s.submitted_at AS date_kumpul, s.revision_number,
            u.name_lengkap AS siswa_name, a.title AS title_asesmen,
            c.id AS course_id, c.title AS course_title
       FROM submissions s
       JOIN enrollments e ON e.id = s.enrollment_id
       JOIN users u ON u.id = e.user_id
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
      WHERE ${whereSql}
      ORDER BY s.submitted_at DESC NULLS LAST
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
