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
  kategori_nama?: string | null;
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
  status: 'belum_memenuhi_syarat' | 'memenuhi_syarat' | 'terbit';
  syarat_snapshot: unknown;
  tanggal_terbit: string | null;
  is_revoked: boolean;
  revoked_reason: string | null;
  supersedes_certificate_id: string | null;
  diterbitkan_oleh: string | null;
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
  kriteria: unknown;
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
  tanggal_diraih: string;
}

export interface PointsLedgerRow {
  id: string;
  user_id: string;
  jenis: 'earn' | 'spend';
  jumlah: number;
  saldo_setelah: number;
  sumber_type: string | null;
  sumber_id: string | null;
  description: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  id: string;
  periode_jenis: string;
  periode_mulai: string;
  periode_selesai: string;
  course_id: string | null;
  data: unknown;
  dihitung_at: string;
}

export interface StreakRow {
  id: string;
  user_id: string;
  streak_hari_berjalan: number;
  streak_terpanjang: number;
  tanggal_terakhir_aktif: string | null;
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
 * Ujian akhir course yang masih berlaku: ditunjuk di `courses.final_exam_quiz_id`,
 * belum dihapus, dan aktif. Quiz yang dinonaktifkan tidak bisa dikerjakan, jadi
 * tidak boleh mengunci certificate siapa pun.
 */
export async function getFinalExam(
  courseId: string,
): Promise<{ id: string; title: string; passing_score: string | null; total_points: string } | null> {
  return queryOne(
    `SELECT q.id, q.title, q.passing_score, q.total_points
       FROM courses c JOIN quizzes q ON q.id = c.final_exam_quiz_id
      WHERE c.id = $1 AND q.deleted_at IS NULL AND q.is_active = true`,
    [courseId],
  );
}

/** Skor (poin) terbaik dari percobaan yang sudah selesai dinilai. */
export async function bestGradedScore(enrollmentId: string, quizId: string): Promise<string | null> {
  const row = await queryOne<{ skor: string | null }>(
    `SELECT max(skor) AS skor FROM quiz_attempts
      WHERE enrollment_id = $1 AND quiz_id = $2 AND status = 'dinilai'`,
    [enrollmentId, quizId],
  );
  return row?.skor ?? null;
}

// ── Certificate templates ──────────────────────────────────

export async function listTemplates(p: PageParams): Promise<{ rows: CertificateTemplateRow[]; total: number }> {
  // The category name is joined in rather than left to the client: the table
  // only stores `category_id`, so a list that selected `*` gave the UI a UUID
  // and its Category column rendered empty on every row.
  const rows = await query<CertificateTemplateRow>(
    `SELECT ct.*, c.name AS kategori_nama
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

export async function getByNomor(nomor: string): Promise<CertificateRow | null> {
  return queryOne<CertificateRow>(`SELECT * FROM certificates WHERE certificate_number = $1 AND deleted_at IS NULL`, [nomor]);
}

export async function findActiveByEnrollment(enrollmentId: string): Promise<CertificateRow | null> {
  return queryOne<CertificateRow>(
    `SELECT * FROM certificates WHERE enrollment_id = $1 AND is_revoked = false AND deleted_at IS NULL`,
    [enrollmentId],
  );
}

export async function insertPending(
  data: { user_id: string; course_id: string; enrollment_id: string; template_id: string | null; status: string; syarat_snapshot: unknown },
  tx?: PoolClient,
): Promise<CertificateRow> {
  const row = await runner(tx).query<CertificateRow>(
    `INSERT INTO certificates (user_id, course_id, enrollment_id, template_id, status, syarat_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.user_id, data.course_id, data.enrollment_id, data.template_id, data.status, JSON.stringify(data.syarat_snapshot)],
  );
  return row.rows[0];
}

export async function updateStatus(
  id: string,
  status: string,
  syaratSnapshot: unknown,
  tx?: PoolClient,
): Promise<void> {
  await runner(tx).query(`UPDATE certificates SET status = $2, syarat_snapshot = $3 WHERE id = $1`, [
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
  data: { certificate_number: string; verification_code: string; qr_code_url: string | null; pdf_url: string | null; diterbitkan_oleh: string | null },
  tx: PoolClient,
): Promise<CertificateRow> {
  const res = await tx.query<CertificateRow>(
    `UPDATE certificates
        SET status = 'terbit', certificate_number = $2, verification_code = $3,
            qr_code_url = $4, pdf_url = $5, tanggal_terbit = now(), diterbitkan_oleh = $6
      WHERE id = $1 RETURNING *`,
    [id, data.certificate_number, data.verification_code, data.qr_code_url, data.pdf_url, data.diterbitkan_oleh],
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
    syarat_snapshot: unknown;
    supersedes_certificate_id: string;
    diterbitkan_oleh: string | null;
  },
  tx: PoolClient,
): Promise<CertificateRow> {
  const res = await tx.query<CertificateRow>(
    `INSERT INTO certificates
       (user_id, course_id, enrollment_id, template_id, status, certificate_number, verification_code,
        syarat_snapshot, tanggal_terbit, supersedes_certificate_id, diterbitkan_oleh)
     VALUES ($1,$2,$3,$4,'terbit',$5,$6,$7,now(),$8,$9) RETURNING *`,
    [
      data.user_id,
      data.course_id,
      data.enrollment_id,
      data.template_id,
      data.certificate_number,
      data.verification_code,
      JSON.stringify(data.syarat_snapshot),
      data.supersedes_certificate_id,
      data.diterbitkan_oleh,
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
  tanggal_terbit: string | null;
  status: 'valid' | 'dibatalkan' | 'tidak_ditemukan';
}

export async function verifyByNomor(nomor: string): Promise<VerificationResult | null> {
  const row = await queryOne<{
    name: string;
    course: string;
    instructor: string | null;
    certificate_number: string;
    qr_code_url: string | null;
    tanggal_terbit: string | null;
    is_revoked: boolean;
    status: string;
  }>(
    `SELECT u.nama_lengkap AS name, c.title AS course, iu.nama_lengkap AS instructor,
            cert.certificate_number, cert.qr_code_url, cert.tanggal_terbit, cert.is_revoked, cert.status
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       LEFT JOIN instructor_profiles ip ON ip.id = c.instructor_id
       LEFT JOIN users iu ON iu.id = ip.user_id
      WHERE cert.certificate_number = $1 AND cert.deleted_at IS NULL`,
    [nomor],
  );
  if (!row) return null;
  return {
    name: row.name,
    course: row.course,
    instructor: row.instructor,
    certificate_number: row.certificate_number,
    qr_code_url: row.qr_code_url,
    tanggal_terbit: row.tanggal_terbit,
    status: row.is_revoked ? 'dibatalkan' : row.status === 'terbit' ? 'valid' : 'tidak_ditemukan',
  };
}

export interface CertificateDisplay {
  id: string;
  user_id: string;
  certificate_number: string | null;
  verification_code: string | null;
  qr_code_url: string | null;
  status: string;
  tanggal_terbit: string | null;
  is_revoked: boolean;
  name: string;
  course: string;
  instructor: string | null;
}

/** Data lengkap untuk merender desain certificate (name, course, instructor, QR, dsb). */
export async function displayById(id: string): Promise<CertificateDisplay | null> {
  return queryOne<CertificateDisplay>(
    `SELECT cert.id, cert.user_id, cert.certificate_number, cert.verification_code, cert.qr_code_url,
            cert.status, cert.tanggal_terbit, cert.is_revoked,
            u.nama_lengkap AS name, c.title AS course, iu.nama_lengkap AS instructor
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
  kriteria: unknown;
  icon_url: string | null;
  is_active: boolean;
}): Promise<BadgeRow> {
  const row = await queryOne<BadgeRow>(
    `INSERT INTO badges (kode, name, description, kriteria, icon_url, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.kode, data.name, data.description, JSON.stringify(data.kriteria), data.icon_url, data.is_active],
  );
  return row!;
}

export async function listUserBadges(userId: string): Promise<UserBadgeRow[]> {
  return query<UserBadgeRow>(`SELECT * FROM user_badges WHERE user_id = $1 AND deleted_at IS NULL ORDER BY tanggal_diraih DESC`, [
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
  const row = await queryOne<{ saldo_setelah: number }>(
    `SELECT saldo_setelah FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return row?.saldo_setelah ?? 0;
}

export async function insertPointsEntry(data: {
  user_id: string;
  jenis: 'earn' | 'spend';
  jumlah: number;
  saldo_setelah: number;
  sumber_type: string | null;
  sumber_id: string | null;
  description: string | null;
}): Promise<PointsLedgerRow> {
  const row = await queryOne<PointsLedgerRow>(
    `INSERT INTO points_ledger (user_id, jenis, jumlah, saldo_setelah, sumber_type, sumber_id, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.user_id, data.jenis, data.jumlah, data.saldo_setelah, data.sumber_type, data.sumber_id, data.description],
  );
  return row!;
}

export async function listPointsLedger(userId: string, p: PageParams): Promise<{ rows: PointsLedgerRow[]; total: number }> {
  const rows = await query<PointsLedgerRow>(
    `SELECT * FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
    [userId],
  );
  const totalRow = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM points_ledger WHERE user_id = $1`, [userId]);
  return { rows, total: Number(totalRow?.count ?? 0) };
}

// ── Leaderboards ──────────────────────────────────────────

export async function listLeaderboards(filters: { periode_jenis?: string; course_id?: string }): Promise<LeaderboardRow[]> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.periode_jenis) {
    params.push(filters.periode_jenis);
    where.push(`periode_jenis = $${params.length}`);
  }
  if (filters.course_id) {
    params.push(filters.course_id);
    where.push(`course_id = $${params.length}`);
  }
  return query<LeaderboardRow>(
    `SELECT * FROM leaderboards WHERE ${where.join(' AND ')} ORDER BY periode_selesai DESC LIMIT 50`,
    params,
  );
}

export async function computeRanking(
  courseId: string | null,
): Promise<Array<{ user_id: string; name: string; poin: number }>> {
  const rows = await query<{ user_id: string; name: string; poin: string }>(
    courseId
      ? `SELECT pl.user_id, u.nama_lengkap AS name,
                SUM(CASE WHEN pl.jenis = 'earn' THEN pl.jumlah ELSE -pl.jumlah END) AS poin
           FROM points_ledger pl
           JOIN users u ON u.id = pl.user_id
           JOIN enrollments e ON e.user_id = pl.user_id AND e.course_id = $1 AND e.deleted_at IS NULL
          GROUP BY pl.user_id, u.nama_lengkap
          ORDER BY poin DESC`
      : `SELECT pl.user_id, u.nama_lengkap AS name,
                SUM(CASE WHEN pl.jenis = 'earn' THEN pl.jumlah ELSE -pl.jumlah END) AS poin
           FROM points_ledger pl
           JOIN users u ON u.id = pl.user_id
          GROUP BY pl.user_id, u.nama_lengkap
          ORDER BY poin DESC`,
    courseId ? [courseId] : [],
  );
  return rows.map((r) => ({ user_id: r.user_id, name: r.name, poin: Number(r.poin) }));
}

export async function insertLeaderboardSnapshot(data: {
  periode_jenis: string;
  periode_mulai: string;
  periode_selesai: string;
  course_id: string | null;
  data_json: unknown;
}): Promise<LeaderboardRow> {
  const row = await queryOne<LeaderboardRow>(
    `INSERT INTO leaderboards (periode_jenis, periode_mulai, periode_selesai, course_id, data)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (periode_jenis, periode_mulai, periode_selesai, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'))
       WHERE deleted_at IS NULL
       DO UPDATE SET data = EXCLUDED.data, dihitung_at = now()
     RETURNING *`,
    [data.periode_jenis, data.periode_mulai, data.periode_selesai, data.course_id, JSON.stringify(data.data_json)],
  );
  return row!;
}

// ── Streaks ─────────────────────────────────────────────────

export async function getStreak(userId: string): Promise<StreakRow | null> {
  return queryOne<StreakRow>(`SELECT * FROM streaks WHERE user_id = $1 AND deleted_at IS NULL`, [userId]);
}

export async function upsertStreak(data: {
  user_id: string;
  streak_hari_berjalan: number;
  streak_terpanjang: number;
  tanggal_terakhir_aktif: string;
}): Promise<StreakRow> {
  const row = await queryOne<StreakRow>(
    `INSERT INTO streaks (user_id, streak_hari_berjalan, streak_terpanjang, tanggal_terakhir_aktif)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET
       streak_hari_berjalan = EXCLUDED.streak_hari_berjalan,
       streak_terpanjang = GREATEST(streaks.streak_terpanjang, EXCLUDED.streak_terpanjang),
       tanggal_terakhir_aktif = EXCLUDED.tanggal_terakhir_aktif,
       updated_at = now()
     RETURNING *`,
    [data.user_id, data.streak_hari_berjalan, data.streak_terpanjang, data.tanggal_terakhir_aktif],
  );
  return row!;
}
