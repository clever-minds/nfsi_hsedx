import { PoolClient } from 'pg';
import { pool, query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

// ── kategori_biaya ───────────────────────────────────────────────────────

export interface KategoriBiayaRow {
  id: string;
  kode: string;
  nama: string;
  jenis: 'pemasukan' | 'pengeluaran';
  is_system: boolean;
}

export async function getKategoriBiaya(id: string): Promise<KategoriBiayaRow | null> {
  return queryOne<KategoriBiayaRow>(
    `SELECT id, kode, nama, jenis, is_system FROM kategori_biaya WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function listKategoriBiaya(): Promise<KategoriBiayaRow[]> {
  return query<KategoriBiayaRow>(
    `SELECT id, kode, nama, jenis, is_system FROM kategori_biaya WHERE deleted_at IS NULL ORDER BY jenis, nama`,
  );
}

// ── financial_entries ────────────────────────────────────────────────────

export interface FinancialEntryRow {
  id: string;
  jenis: 'pemasukan' | 'pengeluaran';
  kategori_id: string;
  kategori_nama: string;
  course_id: string | null;
  nominal: string;
  bukti: string | null;
  tanggal: string;
  periode_bulan: number;
  periode_tahun: number;
  deskripsi: string | null;
  dicatat_oleh: string;
  sumber_type: string | null;
  sumber_id: string | null;
  created_at: string;
}

export interface FinancialEntryFilters {
  jenis?: 'pemasukan' | 'pengeluaran';
  kategori_id?: string;
  course_id?: string;
  dari?: string;
  sampai?: string;
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
  if (f.jenis) add('fe.jenis = $?', f.jenis);
  if (f.kategori_id) add('fe.kategori_id = $?', f.kategori_id);
  if (f.course_id) add('fe.course_id = $?', f.course_id);
  if (f.dari) add('fe.tanggal >= $?', f.dari);
  if (f.sampai) add('fe.tanggal <= $?', f.sampai);

  const whereSql = where.join(' AND ');
  const rows = await query<FinancialEntryRow>(
    `SELECT fe.id, fe.jenis, fe.kategori_id, kb.nama AS kategori_nama, fe.course_id, fe.nominal, fe.bukti,
            fe.tanggal, fe.periode_bulan, fe.periode_tahun, fe.deskripsi, fe.dicatat_oleh,
            fe.sumber_type, fe.sumber_id, fe.created_at
       FROM financial_entries fe
       JOIN kategori_biaya kb ON kb.id = fe.kategori_id
      WHERE ${whereSql}
      ORDER BY fe.tanggal DESC
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
  jenis: string;
  kategori_id: string;
  course_id: string | null;
  nominal: number;
  bukti: string | null;
  tanggal: string;
  periode_bulan: number;
  periode_tahun: number;
  deskripsi: string | null;
  dicatat_oleh: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO financial_entries
       (jenis, kategori_id, course_id, nominal, bukti, tanggal, periode_bulan, periode_tahun, deskripsi, dicatat_oleh)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      data.jenis,
      data.kategori_id,
      data.course_id,
      data.nominal,
      data.bukti,
      data.tanggal,
      data.periode_bulan,
      data.periode_tahun,
      data.deskripsi,
      data.dicatat_oleh,
    ],
  );
  return row!;
}

export interface CashflowRow {
  periode_tahun: number;
  periode_bulan: number;
  pemasukan: string;
  pengeluaran: string;
}

/** Agregasi arus kas & laba per periode (bulan/tahun) dalam rentang tanggal. */
export async function cashflowByPeriod(f: { dari?: string; sampai?: string }): Promise<CashflowRow[]> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.dari) {
    params.push(f.dari);
    where.push(`tanggal >= $${params.length}`);
  }
  if (f.sampai) {
    params.push(f.sampai);
    where.push(`tanggal <= $${params.length}`);
  }
  return query<CashflowRow>(
    `SELECT periode_tahun, periode_bulan,
            COALESCE(SUM(nominal) FILTER (WHERE jenis = 'pemasukan'), 0) AS pemasukan,
            COALESCE(SUM(nominal) FILTER (WHERE jenis = 'pengeluaran'), 0) AS pengeluaran
       FROM financial_entries
      WHERE ${where.join(' AND ')}
      GROUP BY periode_tahun, periode_bulan
      ORDER BY periode_tahun, periode_bulan`,
    params,
  );
}

// ── instructor_payouts ───────────────────────────────────────────────────

/**
 * Bentuk baris payout yang dikirim ke klien.
 *
 * Nama field di sini mengikuti apa yang dibaca klien, bukan nama kolom mentah.
 * Query di bawah yang memberi alias — pola yang sama dipakai modul dashboard.
 *
 * Hasil `query()` tidak diperiksa saat runtime, jadi antarmuka ini adalah satu-
 * satunya kontrak antara SQL dan klien: begitu SELECT-nya berubah, ubah juga di
 * sini, atau field akan sampai sebagai `undefined` tanpa peringatan apa pun.
 */
export interface PayoutRow {
  id: string;
  instructor_id: string;
  instruktur_nama: string | null;
  periode: string;
  nominal: string;
  status: 'dihitung' | 'menunggu_approval' | 'disetujui' | 'ditolak' | 'pencairan' | 'selesai';
  disetujui_oleh: string | null;
  catatan: string | null;
  dicairkan_at: string | null;
  created_at: string;
}

export interface PayoutFilters {
  status?: string;
  instructorId?: string; // scoping: instruktur hanya lihat miliknya
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
    `SELECT ip.id, ip.instructor_id, ip.periode,
            ip.total_nominal AS nominal,
            ip.status, ip.catatan, ip.disetujui_oleh, ip.dicairkan_at, ip.created_at,
            u.nama_lengkap AS instruktur_nama
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
 * Total nominal payout yang menunggu persetujuan, memakai scoping instruktur
 * yang sama dengan `listPayouts`.
 *
 * Dihitung di database, bukan dari baris yang terkirim: halaman hanya memuat 20
 * baris, jadi menjumlahkannya di klien menghasilkan angka yang selalu kurang
 * begitu antrean melebihi satu halaman.
 */
export async function sumPendingPayouts(f: PayoutFilters): Promise<number> {
  const where: string[] = ['ip.deleted_at IS NULL', "ip.status = 'menunggu_approval'"];
  const params: unknown[] = [];
  if (f.instructorId) {
    params.push(f.instructorId);
    where.push(`ip.instructor_id = $${params.length}`);
  }
  const row = await queryOne<{ jumlah: string }>(
    `SELECT COALESCE(SUM(ip.total_nominal), 0)::text AS jumlah
       FROM instructor_payouts ip
      WHERE ${where.join(' AND ')}`,
    params,
  );
  return Number(row?.jumlah ?? 0);
}

/** Resolve instructor_profiles.id dari user id (null bila bukan instruktur). */
export async function instructorProfileIdByUser(userId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM instructor_profiles WHERE user_id = $1`,
    [userId],
  );
  return row?.id ?? null;
}

/** Saldo revenue share yang belum masuk payout untuk seorang instruktur (profile id). */
export async function availableSharesByInstructor(
  instructorProfileId: string,
): Promise<{ nominal: number; jumlah: number }> {
  const row = await queryOne<{ nominal: string; jumlah: string }>(
    `SELECT COALESCE(SUM(nominal_share), 0)::numeric(18,2) AS nominal, COUNT(*)::int AS jumlah
       FROM revenue_shares
      WHERE instructor_id = $1 AND status = 'dihitung' AND instructor_payout_id IS NULL AND deleted_at IS NULL`,
    [instructorProfileId],
  );
  return { nominal: Number(row?.nominal ?? 0), jumlah: Number(row?.jumlah ?? 0) };
}

/** Buat payout dari seluruh revenue share tersedia milik instruktur (transaksi). */
export interface CreatedPayout {
  id: string;
  total_nominal: string;
  status: string;
}

export async function createPayoutFromShares(
  tx: PoolClient,
  instructorProfileId: string,
  diajukanOleh: string,
  periode: string,
): Promise<CreatedPayout> {
  const agg = await tx.query<{ nominal: string; jumlah: string }>(
    `SELECT COALESCE(SUM(nominal_share), 0)::numeric(18,2) AS nominal, COUNT(*)::int AS jumlah
       FROM revenue_shares
      WHERE instructor_id = $1 AND status = 'dihitung' AND instructor_payout_id IS NULL AND deleted_at IS NULL
      FOR UPDATE`,
    [instructorProfileId],
  );
  const nominal = Number(agg.rows[0]?.nominal ?? 0);
  const jumlah = Number(agg.rows[0]?.jumlah ?? 0);
  if (jumlah === 0 || nominal <= 0) {
    throw new Error('NO_BALANCE');
  }
  const ins = await tx.query<CreatedPayout>(
    `INSERT INTO instructor_payouts (instructor_id, periode, total_nominal, status, diajukan_oleh)
     VALUES ($1, $2, $3, 'menunggu_approval', $4)
     RETURNING id, total_nominal, status`,
    [instructorProfileId, periode, nominal, diajukanOleh],
  );
  const payout = ins.rows[0];
  await tx.query(
    `UPDATE revenue_shares
        SET status = 'termasuk_payout', instructor_payout_id = $2, updated_at = now()
      WHERE instructor_id = $1 AND status = 'dihitung' AND instructor_payout_id IS NULL AND deleted_at IS NULL`,
    [instructorProfileId, payout.id],
  );
  return payout;
}

export async function getPayout(id: string, tx?: PoolClient): Promise<PayoutRow | null> {
  const runner = tx ?? pool;
  const res = await runner.query<PayoutRow>(`SELECT * FROM instructor_payouts WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return res.rows[0] ?? null;
}

/** Ambil payout dengan row-lock dalam transaksi (cegah approve/disburse ganda bersamaan). */
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
  catatanApproval: string | null,
): Promise<void> {
  await tx.query(
    `UPDATE instructor_payouts
        SET status = $2, disetujui_oleh = $3, disetujui_at = now(), catatan = COALESCE($4, catatan), updated_at = now()
      WHERE id = $1`,
    [id, status, disetujuiOleh, catatanApproval],
  );
}

/** Pencairan payout — WAJIB sudah berstatus 'disetujui'. */
export async function markPayoutPaid(tx: PoolClient, id: string): Promise<void> {
  await tx.query(
    `UPDATE instructor_payouts
        SET status = 'selesai', dicairkan_at = now(), updated_at = now()
      WHERE id = $1`,
    [id],
  );
}

// ── report_snapshots ─────────────────────────────────────────────────────

export interface ReportSnapshotRow {
  id: string;
  judul: string;
  jenis_laporan: 'keuangan' | 'operasional' | 'kursus';
  periode_mulai: string;
  periode_selesai: string;
  data: unknown;
  status_publikasi: 'draft' | 'dipublikasi' | 'diarsip';
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
  ulasan: string | null;
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
  ulasan: string | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO reviews (enrollment_id, user_id, course_id, rating, ulasan)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.enrollment_id, data.user_id, data.course_id, data.rating, data.ulasan],
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
