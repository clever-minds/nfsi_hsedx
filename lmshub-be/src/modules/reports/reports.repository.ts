import { PoolClient } from 'pg';
import { pool, query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

// ── expense_category ───────────────────────────────────────────────────────

export interface KategoriBiayaRow {
  id: string;
  kode: string;
  name: string;
  type: 'income' | 'expense';
  is_system: boolean;
}

export async function getKategoriBiaya(id: string): Promise<KategoriBiayaRow | null> {
  return queryOne<KategoriBiayaRow>(
    `SELECT id, kode, name, type, is_system FROM expense_category WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function listKategoriBiaya(): Promise<KategoriBiayaRow[]> {
  return query<KategoriBiayaRow>(
    `SELECT id, kode, name, type, is_system FROM expense_category WHERE deleted_at IS NULL ORDER BY type, name`,
  );
}

// ── financial_entries ────────────────────────────────────────────────────

export interface FinancialEntryRow {
  id: string;
  type: 'income' | 'expense';
  category_id: string;
  category_name: string;
  course_id: string | null;
  amount: string;
  proof: string | null;
  date: string;
  period_month: number;
  period_year: number;
  description: string | null;
  recorded_by: string;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

export interface FinancialEntryFilters {
  type?: 'income' | 'expense';
  category_id?: string;
  course_id?: string;
  from?: string;
  until?: string;
}

export async function listFinancialEntries(
  p: PageParams,
  f: FinancialEntryFilters,
): Promise<{ rows: FinancialEntryRow[]; total: number }> {
  const where: string[] = ['fe.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.type) add('fe.type = $?', f.type);
  if (f.category_id) add('fe.category_id = $?', f.category_id);
  if (f.course_id) add('fe.course_id = $?', f.course_id);
  if (f.from) add('fe.date >= $?', f.from);
  if (f.until) add('fe.date <= $?', f.until);

  const whereSql = where.join(' AND ');
  const rows = await query<FinancialEntryRow>(
    `SELECT fe.id, fe.type, fe.category_id, kb.name AS category_name, fe.course_id, fe.amount, fe.proof,
            fe.date, fe.period_month, fe.period_year, fe.description, fe.recorded_by,
            fe.source_type, fe.source_id, fe.created_at
       FROM financial_entries fe
       JOIN expense_category kb ON kb.id = fe.category_id
      WHERE ${whereSql}
      ORDER BY fe.date DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM financial_entries fe WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function insertFinancialEntry(data: {
  type: string;
  category_id: string;
  course_id: string | null;
  amount: number;
  proof: string | null;
  date: string;
  period_month: number;
  period_year: number;
  description: string | null;
  recorded_by: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO financial_entries
       (type, category_id, course_id, amount, proof, date, period_month, period_year, description, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      data.type,
      data.category_id,
      data.course_id,
      data.amount,
      data.proof,
      data.date,
      data.period_month,
      data.period_year,
      data.description,
      data.recorded_by,
    ],
  );
  return row!;
}

export interface CashflowRow {
  period_year: number;
  period_month: number;
  pemasukan: string;
  pengeluaran: string;
}

/** Agregasi arus kas & laba per period (month/year) dalam rentang date. */
export async function cashflowByPeriod(f: { from?: string; until?: string }): Promise<CashflowRow[]> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.from) {
    params.push(f.from);
    where.push(`date >= $${params.length}`);
  }
  if (f.until) {
    params.push(f.until);
    where.push(`date <= $${params.length}`);
  }
  return query<CashflowRow>(
    `SELECT period_year, period_month,
            COALESCE(SUM(amount) FILTER (WHERE type = 'income'), 0) AS pemasukan,
            COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS pengeluaran
       FROM financial_entries
      WHERE ${where.join(' AND ')}
      GROUP BY period_year, period_month
      ORDER BY period_year, period_month`,
    params,
  );
}

// ── instructor_payouts ───────────────────────────────────────────────────

/**
 * Bentuk baris payout yang dikirim to klien.
 *
 * name field di sini mengikuti apa yang read klien, bukan name kolom mentah.
 * Query di bawah yang memberi alias — pola yang sama dipakai modul dashboard.
 *
 * Hasil `query()` no diperiksa saat runtime, jadi antarmuka ini adalah satu-
 * satunya kontrak antara SQL dan klien: begitu SELECT-nya berubah, edit juga di
 * sini, atau field akan until sebagai `undefined` tanpa warning apa pun.
 */
export interface PayoutRow {
  id: string;
  instructor_id: string;
  instruktur_name: string | null;
  period: string;
  amount: string;
  status: 'calculated' | 'awaiting_approval' | 'approved' | 'rejected' | 'disbursement' | 'completed';
  approved_by: string | null;
  notes: string | null;
  disbursed_at: string | null;
  created_at: string;
}

export interface PayoutFilters {
  status?: string;
  instructorId?: string; // scoping: instructor hanya view miliknya
}

export async function listPayouts(p: PageParams, f: PayoutFilters): Promise<{ rows: PayoutRow[]; total: number }> {
  const where: string[] = ['ip.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.status) add('ip.status = $?', f.status);
  if (f.instructorId) add('ip.instructor_id = $?', f.instructorId);

  const whereSql = where.join(' AND ');
  const rows = await query<PayoutRow>(
    `SELECT ip.id, ip.instructor_id, ip.period,
            ip.total_amount AS amount,
            ip.status, ip.notes, ip.approved_by, ip.disbursed_at, ip.created_at,
            u.name_lengkap AS instruktur_name
       FROM instructor_payouts ip
       LEFT JOIN instructor_profiles pr ON pr.id = ip.instructor_id
       LEFT JOIN users u ON u.id = pr.user_id
      WHERE ${whereSql}
      ORDER BY ip.created_at DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM instructor_payouts ip WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

/**
 * Total amount payout yang menunggu persetujuan, memakai scoping instructor
 * yang sama dengan `listPayouts`.
 *
 * Dihitung di database, bukan from baris yang terkirim: halaman hanya memuat 20
 * baris, jadi menjumlahkannya di klien menghasilkan angka yang selalu kurang
 * begitu antrean melebihi satu halaman.
 */
export async function sumPendingPayouts(f: PayoutFilters): Promise<number> {
  const where: string[] = ['ip.deleted_at IS NULL', "ip.status = 'awaiting_approval'"];
  const params: unknown[] = [];
  if (f.instructorId) {
    params.push(f.instructorId);
    where.push(`ip.instructor_id = $${params.length}`);
  }
  const row = await queryOne<{ amount: string }>(
    `SELECT COALESCE(SUM(ip.total_amount), 0)::text AS amount
       FROM instructor_payouts ip
      WHERE ${where.join(' AND ')}`,
    params,
  );
  return Number(row?.amount ?? 0);
}

/** Resolve instructor_profiles.id from user id (null bila bukan instructor). */
export async function instructorProfileIdByUser(userId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM instructor_profiles WHERE user_id = $1`,
    [userId],
  );
  return row?.id ?? null;
}

/** Saldo revenue share yang belum login payout untuk seorang instructor (profile id). */
export async function availableSharesByInstructor(
  instructorProfileId: string,
): Promise<{ amount: number; count: number }> {
  const row = await queryOne<{ amount: string; count: string }>(
    `SELECT COALESCE(SUM(share_amount), 0)::numeric(18,2) AS amount, COUNT(*)::int AS count
       FROM revenue_shares
      WHERE instructor_id = $1 AND status = 'calculated' AND instructor_payout_id IS NULL AND deleted_at IS NULL`,
    [instructorProfileId],
  );
  return { amount: Number(row?.amount ?? 0), count: Number(row?.count ?? 0) };
}

/** Buat payout from seluruh revenue share tersedia milik instructor (transaction). */
export interface CreatedPayout {
  id: string;
  total_amount: string;
  status: string;
}

export async function createPayoutFromShares(
  tx: PoolClient,
  instructorProfileId: string,
  diajukanOleh: string,
  period: string,
): Promise<CreatedPayout> {
  const agg = await tx.query<{ amount: string; count: string }>(
    `SELECT COALESCE(SUM(share_amount), 0)::numeric(18,2) AS amount, COUNT(*)::int AS count
       FROM revenue_shares
      WHERE instructor_id = $1 AND status = 'calculated' AND instructor_payout_id IS NULL AND deleted_at IS NULL
      FOR UPDATE`,
    [instructorProfileId],
  );
  const amount = Number(agg.rows[0]?.amount ?? 0);
  const count = Number(agg.rows[0]?.count ?? 0);
  if (count === 0 || amount <= 0) {

    throw new Error('NO_BALANCE');
  }
  const ins = await tx.query<CreatedPayout>(
    `INSERT INTO instructor_payouts (instructor_id, period, total_amount, status, submitted_by)
     VALUES ($1, $2, $3, 'awaiting_approval', $4)
     RETURNING id, total_amount, status`,
    [instructorProfileId, period, amount, diajukanOleh],
  );
  const payout = ins.rows[0];
  await tx.query(
    `UPDATE revenue_shares
        SET status = 'included_in_payout', instructor_payout_id = $2, updated_at = now()
      WHERE instructor_id = $1 AND status = 'calculated' AND instructor_payout_id IS NULL AND deleted_at IS NULL`,
    [instructorProfileId, payout.id],
  );
  return payout;
}

export async function getPayout(id: string, tx?: PoolClient): Promise<PayoutRow | null> {
  const runner = tx ?? pool;
  const res = await runner.query<PayoutRow>(`SELECT * FROM instructor_payouts WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return res.rows[0] ?? null;
}

/** Ambil payout dengan row-lock dalam transaction (cegah approve/disburse ganda bersamaan). */
export async function getPayoutForUpdate(tx: PoolClient, id: string): Promise<PayoutRow | null> {
  const res = await tx.query<PayoutRow>(
    `SELECT * FROM instructor_payouts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function setPayoutStatus(
  tx: PoolClient,
  id: string,
  status: string,
  disetujuiOleh: string | null,
  notesApproval: string | null,
): Promise<void> {
  await tx.query(
    `UPDATE instructor_payouts
        SET status = $2, approved_by = $3, approved_at = now(), notes = COALESCE($4, notes), updated_at = now()
      WHERE id = $1`,
    [id, status, disetujuiOleh, notesApproval],
  );
}

/** Pencairan payout — WAJIB sudah berstatus 'approved'. */
export async function markPayoutPaid(tx: PoolClient, id: string): Promise<void> {
  await tx.query(
    `UPDATE instructor_payouts
        SET status = 'completed', disbursed_at = now(), updated_at = now()
      WHERE id = $1`,
    [id],
  );
}

// ── report_snapshots ─────────────────────────────────────────────────────

export interface ReportSnapshotRow {
  id: string;
  title: string;
  report_type: 'finance' | 'operational' | 'course';
  period_start: string;
  period_finish: string;
  data: unknown;
  publication_status: 'draft' | 'published' | 'archived';
  created_at: string;
}

export async function getSnapshot(id: string): Promise<ReportSnapshotRow | null> {
  return queryOne<ReportSnapshotRow>(
    `SELECT * FROM report_snapshots WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

// ── reviews ──────────────────────────────────────────────────────────────

export interface ReviewRow {
  id: string;
  enrollment_id: string;
  user_id: string;
  course_id: string;
  rating: number;
  review: string | null;
  is_hidden: boolean;
  created_at: string;
}

export interface EnrollmentForReview {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
}

export async function getEnrollmentForReview(enrollmentId: string): Promise<EnrollmentForReview | null> {
  return queryOne<EnrollmentForReview>(
    `SELECT id, user_id, course_id, status FROM enrollments WHERE id = $1 AND deleted_at IS NULL`,
    [enrollmentId],
  );
}

export async function getReviewByEnrollment(enrollmentId: string): Promise<ReviewRow | null> {
  return queryOne<ReviewRow>(
    `SELECT * FROM reviews WHERE enrollment_id = $1 AND deleted_at IS NULL`,
    [enrollmentId],
  );
}

export async function insertReview(data: {
  enrollment_id: string;
  user_id: string;
  course_id: string;
  rating: number;
  review: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO reviews (enrollment_id, user_id, course_id, rating, review)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.enrollment_id, data.user_id, data.course_id, data.rating, data.review],
  );
  return row!;
}

export async function listReviewsByCourse(
  courseId: string,
  p: PageParams,
): Promise<{ rows: ReviewRow[]; total: number }> {
  const rows = await query<ReviewRow>(
    `SELECT * FROM reviews WHERE course_id = $1 AND deleted_at IS NULL AND is_hidden = false
      ORDER BY created_at DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    [courseId],
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM reviews WHERE course_id = $1 AND deleted_at IS NULL AND is_hidden = false`,
    [courseId],
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}
