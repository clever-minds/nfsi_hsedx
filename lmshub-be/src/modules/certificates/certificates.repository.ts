import { PoolClient } from 'pg';
import { query, queryOne, pool } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

const runner = (tx?: PoolClient) => tx ?? pool;

export interface CertificateTemplateRow {
  id: string;
  name: string;
  description: string | null;
  layout: unknown;
  category_id: string | null;
  /** Joined from `categories`; absent on single-row lookups. */
  category_name?: string | null;
  course_id: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CertificateRow {
  id: string;
  user_id: string;
  course_id: string;
  enrollment_id: string;
  template_id: string | null;
  certificate_number: string | null;
  verification_code: string | null;
  qr_code_url: string | null;
  pdf_url: string | null;
  status: 'not_eligible' | 'eligible' | 'publish';
  criteria_snapshot: unknown;
  publish_date: string | null;
  is_revoked: boolean;
  revoked_reason: string | null;
  supersedes_certificate_id: string | null;
  issued_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
}

export interface CourseProgressRow {
  enrollment_id: string;
  progress_percent: string;
  completed_lessons_count: number;
  total_lesson: number;
}

export interface BadgeRow {
  id: string;
  kode: string;
  name: string;
  description: string | null;
  criteria: unknown;
  icon_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserBadgeRow {
  id: string;
  user_id: string;
  badge_id: string;
  course_id: string | null;
  date_earned: string;
}

export interface PointsLedgerRow {
  id: string;
  user_id: string;
  type: 'earn' | 'spend';
  amount: number;
  balance_after: number;
  source_type: string | null;
  source_id: string | null;
  description: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  id: string;
  period_type: string;
  period_start: string;
  period_finish: string;
  course_id: string | null;
  data: unknown;
  calculated_at: string;
}

export interface StreakRow {
  id: string;
  user_id: string;
  current_streak_days: number;
  longest_streak: number;
  last_active_date: string | null;
}

// ── Enrollment / progress (read-only, domain lain) ─────────

export async function getEnrollment(id: string): Promise<EnrollmentRow | null> {
  return queryOne<EnrollmentRow>(
    `SELECT id, user_id, course_id, status FROM enrollments WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function getCourseProgress(enrollmentId: string): Promise<CourseProgressRow | null> {
  return queryOne<CourseProgressRow>(
    `SELECT enrollment_id, progress_percent, completed_lessons_count, total_lesson
       FROM course_progress WHERE enrollment_id = $1`,
    [enrollmentId],
  );
}

/**
 * Final exam of the course that is still valid: specified in `courses.final_exam_quiz_id`,
 * not deleted, and active. Deactivated quizzes cannot be taken, so
 * they shouldn't lock anyone's certificate.
 */
export async function getFinalExam(
  courseId: string,
): Promise<{ id: string; title: string; passing_score: string | null; total_pointsts: string } | null> {
  return queryOne(
    `SELECT q.id, q.title, q.passing_score, q.total_pointsts
       FROM courses c JOIN quizzes q ON q.id = c.final_exam_quiz_id
      WHERE c.id = $1 AND q.deleted_at IS NULL AND q.is_active = true`,
    [courseId],
  );
}

/** Best score from attempts that have finished being graded. */
export async function bestGradedScore(enrollmentId: string, quizId: string): Promise<string | null> {
  const row = await queryOne<{ score: string | null }>(
    `SELECT max(score) AS score FROM quiz_attempts
      WHERE enrollment_id = $1 AND quiz_id = $2 AND status = 'graded'`,
    [enrollmentId, quizId],
  );
  return row?.score ?? null;
}

// ── Certificate templates ──────────────────────────────────

export async function listTemplates(p: PageParams): Promise<{ rows: CertificateTemplateRow[]; total: number }> {
  // The category name is joined in rather than left to the client: the table
  // only stores `category_id`, so a list that selected `*` gave the UI a UUID
  // and its Category column rendered empty on every row.
  const rows = await query<CertificateTemplateRow>(
    `SELECT ct.*, c.name AS category_name
       FROM certificate_templates ct
       LEFT JOIN categories c ON c.id = ct.category_id AND c.deleted_at IS NULL
      WHERE ct.deleted_at IS NULL
      ORDER BY ct.created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM certificate_templates WHERE deleted_at IS NULL`,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getTemplate(id: string): Promise<CertificateTemplateRow | null> {
  return queryOne<CertificateTemplateRow>(`SELECT * FROM certificate_templates WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertTemplate(data: {
  name: string;
  description: string | null;
  layout: unknown;
  category_id: string | null;
  course_id: string | null;
  is_default: boolean;
  is_active: boolean;
}): Promise<CertificateTemplateRow> {
  const row = await queryOne<CertificateTemplateRow>(
    `INSERT INTO certificate_templates (name, description, layout, category_id, course_id, is_default, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.name, data.description, JSON.stringify(data.layout), data.category_id, data.course_id, data.is_default, data.is_active],
  );
  return row!;
}

export async function updateTemplate(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys
    .map((k, i) => `${k} = $${i + 2}${k === 'layout' ? '::jsonb' : ''}`)
    .join(', ');
  const values = keys.map((k) => (k === 'layout' ? JSON.stringify(fields[k]) : fields[k]));
  await query(`UPDATE certificate_templates SET ${set} WHERE id = $1`, [id, ...values]);
}

export async function softDeleteTemplate(id: string): Promise<void> {
  await query(`UPDATE certificate_templates SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function clearDefaultTemplate(): Promise<void> {
  await query(`UPDATE certificate_templates SET is_default = false WHERE is_default = true AND deleted_at IS NULL`);
}

// ── Certificates ────────────────────────────────────────────

export interface CertListFilters {
  user_id?: string;
  course_id?: string;
  status?: string;
}

export async function list(p: PageParams, f: CertListFilters): Promise<{ rows: CertificateRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.user_id) add('cert.user_id = $?', f.user_id);
  if (f.course_id) add('cert.course_id = $?', f.course_id);
  if (f.status) add('cert.status = $?', f.status);
  where[0] = 'cert.deleted_at IS NULL';
  const whereSql = where.join(' AND ');
  const rows = await query<CertificateRow>(
    `SELECT cert.*, c.title AS course_title
       FROM certificates cert
       LEFT JOIN courses c ON c.id = cert.course_id
      WHERE ${whereSql} ORDER BY cert.created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM certificates cert WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function detail(id: string): Promise<CertificateRow | null> {
  return queryOne<CertificateRow>(`SELECT * FROM certificates WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function getByNomor(number: string): Promise<CertificateRow | null> {
  return queryOne<CertificateRow>(`SELECT * FROM certificates WHERE certificate_number = $1 AND deleted_at IS NULL`, [number]);
}

export async function findActiveByEnrollment(enrollmentId: string): Promise<CertificateRow | null> {
  return queryOne<CertificateRow>(
    `SELECT * FROM certificates WHERE enrollment_id = $1 AND is_revoked = false AND deleted_at IS NULL`,
    [enrollmentId],
  );
}

export async function insertPending(
  data: { user_id: string; course_id: string; enrollment_id: string; template_id: string | null; status: string; criteria_snapshot: unknown },
  tx?: PoolClient,
): Promise<CertificateRow> {
  const row = await runner(tx).query<CertificateRow>(
    `INSERT INTO certificates (user_id, course_id, enrollment_id, template_id, status, criteria_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.user_id, data.course_id, data.enrollment_id, data.template_id, data.status, JSON.stringify(data.criteria_snapshot)],
  );
  return row.rows[0];
}

export async function updateStatus(
  id: string,
  status: string,
  syaratSnapshot: unknown,
  tx?: PoolClient,
): Promise<void> {
  await runner(tx).query(`UPDATE certificates SET status = $2, criteria_snapshot = $3 WHERE id = $1`, [
    id,
    status,
    JSON.stringify(syaratSnapshot),
  ]);
}

export async function lockForUpdate(id: string, tx: PoolClient): Promise<CertificateRow | null> {
  const res = await tx.query<CertificateRow>(`SELECT * FROM certificates WHERE id = $1 FOR UPDATE`, [id]);
  return res.rows[0] ?? null;
}

export async function issue(
  id: string,
  data: { certificate_number: string; verification_code: string; qr_code_url: string | null; pdf_url: string | null; issued_by: string | null },
  tx: PoolClient,
): Promise<CertificateRow> {
  const res = await tx.query<CertificateRow>(
    `UPDATE certificates
        SET status = 'publish', certificate_number = $2, verification_code = $3,
            qr_code_url = $4, pdf_url = $5, publish_date = now(), issued_by = $6
      WHERE id = $1 RETURNING *`,
    [id, data.certificate_number, data.verification_code, data.qr_code_url, data.pdf_url, data.issued_by],
  );
  return res.rows[0];
}

export async function insertIssuedCopy(
  data: {
    user_id: string;
    course_id: string;
    enrollment_id: string;
    template_id: string | null;
    certificate_number: string;
    verification_code: string;
    criteria_snapshot: unknown;
    supersedes_certificate_id: string;
    issued_by: string | null;
  },
  tx: PoolClient,
): Promise<CertificateRow> {
  const res = await tx.query<CertificateRow>(
    `INSERT INTO certificates
       (user_id, course_id, enrollment_id, template_id, status, certificate_number, verification_code,
        criteria_snapshot, publish_date, supersedes_certificate_id, issued_by)
     VALUES ($1,$2,$3,$4,'publish',$5,$6,$7,now(),$8,$9) RETURNING *`,
    [
      data.user_id,
      data.course_id,
      data.enrollment_id,
      data.template_id,
      data.certificate_number,
      data.verification_code,
      JSON.stringify(data.criteria_snapshot),
      data.supersedes_certificate_id,
      data.issued_by,
    ],
  );
  return res.rows[0];
}

export async function revoke(id: string, reason: string, tx?: PoolClient): Promise<void> {
  await runner(tx).query(`UPDATE certificates SET is_revoked = true, revoked_reason = $2 WHERE id = $1`, [id, reason]);
}

// ── Public verification ────────────────────────────────────

export interface VerificationResult {
  name: string;
  course: string;
  instructor: string | null;
  certificate_number: string;
  qr_code_url: string | null;
  publish_date: string | null;
  status: 'valid' | 'cancelled' | 'tidak_ditemukan';
}

export async function verifyByNomor(number: string): Promise<VerificationResult | null> {
  const row = await queryOne<{
    name: string;
    course: string;
    instructor: string | null;
    certificate_number: string;
    qr_code_url: string | null;
    publish_date: string | null;
    is_revoked: boolean;
    status: string;
  }>(
    `SELECT u.name_lengkap AS name, c.title AS course, iu.name_lengkap AS instructor,
            cert.certificate_number, cert.qr_code_url, cert.publish_date, cert.is_revoked, cert.status
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       LEFT JOIN instructor_profiles ip ON ip.id = c.instructor_id
       LEFT JOIN users iu ON iu.id = ip.user_id
      WHERE cert.certificate_number = $1 AND cert.deleted_at IS NULL`,
    [number],
  );
  if (!row) return null;
  return {
    name: row.name,
    course: row.course,
    instructor: row.instructor,
    certificate_number: row.certificate_number,
    qr_code_url: row.qr_code_url,
    publish_date: row.publish_date,
    status: row.is_revoked ? 'cancelled' : row.status === 'publish' ? 'valid' : 'tidak_ditemukan',
  };
}

export interface CertificateDisplay {
  id: string;
  user_id: string;
  certificate_number: string | null;
  verification_code: string | null;
  qr_code_url: string | null;
  status: string;
  publish_date: string | null;
  is_revoked: boolean;
  name: string;
  course: string;
  instructor: string | null;
  content: string | null;
}

/** Complete data for rendering the certificate design (name, course, instructor, QR, etc). */
export async function displayById(id: string): Promise<CertificateDisplay | null> {
  return queryOne<CertificateDisplay>(
    `SELECT cert.id, cert.user_id, cert.certificate_number, cert.verification_code, cert.qr_code_url,
            cert.status, cert.publish_date, cert.is_revoked,
            u.name_lengkap AS name, c.title AS course, iu.name_lengkap AS instructor,
            COALESCE(
              (SELECT layout->>'content' FROM certificate_templates WHERE id = cert.template_id),
              (SELECT layout->>'content' FROM certificate_templates WHERE course_id = cert.course_id AND is_active = true AND deleted_at IS NULL LIMIT 1),
              (SELECT layout->>'content' FROM certificate_templates WHERE category_id = c.category_id AND is_active = true AND deleted_at IS NULL LIMIT 1),
              (SELECT layout->>'content' FROM certificate_templates WHERE is_default = true AND is_active = true AND deleted_at IS NULL LIMIT 1)
            ) AS content
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       LEFT JOIN instructor_profiles ip ON ip.id = c.instructor_id
       LEFT JOIN users iu ON iu.id = ip.user_id
      WHERE cert.id = $1 AND cert.deleted_at IS NULL`,
    [id],
  );
}

// ── Badges ──────────────────────────────────────────────────

export async function listBadges(p: PageParams): Promise<BadgeRow[]> {
  return query<BadgeRow>(
    `SELECT * FROM badges WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
  );
}

export async function getBadge(id: string): Promise<BadgeRow | null> {
  return queryOne<BadgeRow>(`SELECT * FROM badges WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertBadge(data: {
  kode: string;
  name: string;
  description: string | null;
  criteria: unknown;
  icon_url: string | null;
  is_active: boolean;
}): Promise<BadgeRow> {
  const row = await queryOne<BadgeRow>(
    `INSERT INTO badges (kode, name, description, criteria, icon_url, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.kode, data.name, data.description, JSON.stringify(data.criteria), data.icon_url, data.is_active],
  );
  return row!;
}

export async function listUserBadges(userId: string): Promise<UserBadgeRow[]> {
  return query<UserBadgeRow>(`SELECT * FROM user_badges WHERE user_id = $1 AND deleted_at IS NULL ORDER BY date_earned DESC`, [
    userId,
  ]);
}

export async function findUserBadge(userId: string, badgeId: string): Promise<UserBadgeRow | null> {
  return queryOne<UserBadgeRow>(
    `SELECT * FROM user_badges WHERE user_id = $1 AND badge_id = $2 AND deleted_at IS NULL`,
    [userId, badgeId],
  );
}

export async function awardBadge(data: { user_id: string; badge_id: string; course_id: string | null }): Promise<UserBadgeRow> {
  const row = await queryOne<UserBadgeRow>(
    `INSERT INTO user_badges (user_id, badge_id, course_id) VALUES ($1,$2,$3) RETURNING *`,
    [data.user_id, data.badge_id, data.course_id],
  );
  return row!;
}

// ── Points ledger (append-only) ─────────────────────────────

export async function lastBalance(userId: string): Promise<number> {
  const row = await queryOne<{ balance_after: number }>(
    `SELECT balance_after FROM pointsts_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return row?.balance_after ?? 0;
}

export async function insertPointsEntry(data: {
  user_id: string;
  type: 'earn' | 'spend';
  amount: number;
  balance_after: number;
  source_type: string | null;
  source_id: string | null;
  description: string | null;
}): Promise<PointsLedgerRow> {
  const row = await queryOne<PointsLedgerRow>(
    `INSERT INTO pointsts_ledger (user_id, type, amount, balance_after, source_type, source_id, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.user_id, data.type, data.amount, data.balance_after, data.source_type, data.source_id, data.description],
  );
  return row!;
}

export async function listPointsLedger(userId: string, p: PageParams): Promise<{ rows: PointsLedgerRow[]; total: number }> {
  const rows = await query<PointsLedgerRow>(
    `SELECT * FROM pointsts_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
    [userId],
  );
  const totalRow = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM pointsts_ledger WHERE user_id = $1`, [userId]);
  return { rows, total: Number(totalRow?.count ?? 0) };
}

// ── Leaderboards ──────────────────────────────────────────

export async function listLeaderboards(filters: { period_type?: string; course_id?: string }): Promise<LeaderboardRow[]> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.period_type) {
    params.push(filters.period_type);
    where.push(`period_type = $${params.length}`);
  }
  if (filters.course_id) {
    params.push(filters.course_id);
    where.push(`course_id = $${params.length}`);
  }
  return query<LeaderboardRow>(
    `SELECT * FROM leaderboards WHERE ${where.join(' AND ')} ORDER BY period_finish DESC LIMIT 50`,
    params,
  );
}

export async function computeRanking(
  courseId: string | null,
): Promise<Array<{ user_id: string; name: string; points: number }>> {
  const rows = await query<{ user_id: string; name: string; points: string }>(
    courseId
      ? `SELECT pl.user_id, u.name_lengkap AS name,
                SUM(CASE WHEN pl.type = 'earn' THEN pl.amount ELSE -pl.amount END) AS points
           FROM pointsts_ledger pl
           JOIN users u ON u.id = pl.user_id
           JOIN enrollments e ON e.user_id = pl.user_id AND e.course_id = $1 AND e.deleted_at IS NULL
          GROUP BY pl.user_id, u.name_lengkap
          ORDER BY points DESC`
      : `SELECT pl.user_id, u.name_lengkap AS name,
                SUM(CASE WHEN pl.type = 'earn' THEN pl.amount ELSE -pl.amount END) AS points
           FROM pointsts_ledger pl
           JOIN users u ON u.id = pl.user_id
          GROUP BY pl.user_id, u.name_lengkap
          ORDER BY points DESC`,
    courseId ? [courseId] : [],
  );
  return rows.map((r) => ({ user_id: r.user_id, name: r.name, points: Number(r.points) }));
}

export async function insertLeaderboardSnapshot(data: {
  period_type: string;
  period_start: string;
  period_finish: string;
  course_id: string | null;
  data_json: unknown;
}): Promise<LeaderboardRow> {
  const row = await queryOne<LeaderboardRow>(
    `INSERT INTO leaderboards (period_type, period_start, period_finish, course_id, data)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (period_type, period_start, period_finish, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'))
       WHERE deleted_at IS NULL
       DO UPDATE SET data = EXCLUDED.data, calculated_at = now()
     RETURNING *`,
    [data.period_type, data.period_start, data.period_finish, data.course_id, JSON.stringify(data.data_json)],
  );
  return row!;
}

// ── Streaks ─────────────────────────────────────────────────

export async function getStreak(userId: string): Promise<StreakRow | null> {
  return queryOne<StreakRow>(`SELECT * FROM streaks WHERE user_id = $1 AND deleted_at IS NULL`, [userId]);
}

export async function upsertStreak(data: {
  user_id: string;
  current_streak_days: number;
  longest_streak: number;
  last_active_date: string;
}): Promise<StreakRow> {
  const row = await queryOne<StreakRow>(
    `INSERT INTO streaks (user_id, current_streak_days, longest_streak, last_active_date)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak_days = EXCLUDED.current_streak_days,
       longest_streak = GREATEST(streaks.longest_streak, EXCLUDED.longest_streak),
       last_active_date = EXCLUDED.last_active_date,
       updated_at = now()
     RETURNING *`,
    [data.user_id, data.current_streak_days, data.longest_streak, data.last_active_date],
  );
  return row!;
}
