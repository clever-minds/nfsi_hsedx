import { PoolClient } from 'pg';
import { query, queryOne, pool } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

const runner = (tx?: PoolClient) => tx ?? pool;

export interface CertificateTemplateRow {
  id: string;
  nama: string;
  deskripsi: string | null;
  layout: unknown;
  category_id: string | null;
  /** Joined from `categories`; absent on single-row lookups. */
  kategori_nama?: string | null;
  course_id: string | null;
  is_default: boolean;
  is_aktif: boolean;
  created_at: string;
  updated_at: string;
}

export interface CertificateRow {
  id: string;
  user_id: string;
  course_id: string;
  enrollment_id: string;
  template_id: string | null;
  nomor_sertifikat: string | null;
  kode_verifikasi: string | null;
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
  persen_selesai: string;
  jumlah_lesson_selesai: number;
  total_lesson: number;
}

export interface BadgeRow {
  id: string;
  kode: string;
  nama: string;
  deskripsi: string | null;
  kriteria: unknown;
  icon_url: string | null;
  is_aktif: boolean;
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
  deskripsi: string | null;
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
    `SELECT enrollment_id, persen_selesai, jumlah_lesson_selesai, total_lesson
       FROM course_progress WHERE enrollment_id = $1`,
    [enrollmentId],
  );
}

// ── Certificate templates ──────────────────────────────────

export async function listTemplates(p: PageParams): Promise<{ rows: CertificateTemplateRow[]; total: number }> {
  // The category name is joined in rather than left to the client: the table
  // only stores `category_id`, so a list that selected `*` gave the UI a UUID
  // and its Category column rendered empty on every row.
  const rows = await query<CertificateTemplateRow>(
    `SELECT ct.*, c.nama AS kategori_nama
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
  nama: string;
  deskripsi: string | null;
  layout: unknown;
  category_id: string | null;
  course_id: string | null;
  is_default: boolean;
  is_aktif: boolean;
}): Promise<CertificateTemplateRow> {
  const row = await queryOne<CertificateTemplateRow>(
    `INSERT INTO certificate_templates (nama, deskripsi, layout, category_id, course_id, is_default, is_aktif)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.nama, data.deskripsi, JSON.stringify(data.layout), data.category_id, data.course_id, data.is_default, data.is_aktif],
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
    `SELECT cert.*, c.judul AS kursus_judul
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
  return queryOne<CertificateRow>(`SELECT * FROM certificates WHERE nomor_sertifikat = $1 AND deleted_at IS NULL`, [nomor]);
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
  data: { nomor_sertifikat: string; kode_verifikasi: string; qr_code_url: string | null; pdf_url: string | null; diterbitkan_oleh: string | null },
  tx: PoolClient,
): Promise<CertificateRow> {
  const res = await tx.query<CertificateRow>(
    `UPDATE certificates
        SET status = 'terbit', nomor_sertifikat = $2, kode_verifikasi = $3,
            qr_code_url = $4, pdf_url = $5, tanggal_terbit = now(), diterbitkan_oleh = $6
      WHERE id = $1 RETURNING *`,
    [id, data.nomor_sertifikat, data.kode_verifikasi, data.qr_code_url, data.pdf_url, data.diterbitkan_oleh],
  );
  return res.rows[0];
}

export async function insertIssuedCopy(
  data: {
    user_id: string;
    course_id: string;
    enrollment_id: string;
    template_id: string | null;
    nomor_sertifikat: string;
    kode_verifikasi: string;
    syarat_snapshot: unknown;
    supersedes_certificate_id: string;
    diterbitkan_oleh: string | null;
  },
  tx: PoolClient,
): Promise<CertificateRow> {
  const res = await tx.query<CertificateRow>(
    `INSERT INTO certificates
       (user_id, course_id, enrollment_id, template_id, status, nomor_sertifikat, kode_verifikasi,
        syarat_snapshot, tanggal_terbit, supersedes_certificate_id, diterbitkan_oleh)
     VALUES ($1,$2,$3,$4,'terbit',$5,$6,$7,now(),$8,$9) RETURNING *`,
    [
      data.user_id,
      data.course_id,
      data.enrollment_id,
      data.template_id,
      data.nomor_sertifikat,
      data.kode_verifikasi,
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
  nama: string;
  kursus: string;
  instruktur: string | null;
  nomor_sertifikat: string;
  qr_code_url: string | null;
  tanggal_terbit: string | null;
  status: 'valid' | 'dibatalkan' | 'tidak_ditemukan';
}

export async function verifyByNomor(nomor: string): Promise<VerificationResult | null> {
  const row = await queryOne<{
    nama: string;
    kursus: string;
    instruktur: string | null;
    nomor_sertifikat: string;
    qr_code_url: string | null;
    tanggal_terbit: string | null;
    is_revoked: boolean;
    status: string;
  }>(
    `SELECT u.nama_lengkap AS nama, c.judul AS kursus, iu.nama_lengkap AS instruktur,
            cert.nomor_sertifikat, cert.qr_code_url, cert.tanggal_terbit, cert.is_revoked, cert.status
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       LEFT JOIN instructor_profiles ip ON ip.id = c.instructor_id
       LEFT JOIN users iu ON iu.id = ip.user_id
      WHERE cert.nomor_sertifikat = $1 AND cert.deleted_at IS NULL`,
    [nomor],
  );
  if (!row) return null;
  return {
    nama: row.nama,
    kursus: row.kursus,
    instruktur: row.instruktur,
    nomor_sertifikat: row.nomor_sertifikat,
    qr_code_url: row.qr_code_url,
    tanggal_terbit: row.tanggal_terbit,
    status: row.is_revoked ? 'dibatalkan' : row.status === 'terbit' ? 'valid' : 'tidak_ditemukan',
  };
}

export interface CertificateDisplay {
  id: string;
  user_id: string;
  nomor_sertifikat: string | null;
  kode_verifikasi: string | null;
  qr_code_url: string | null;
  status: string;
  tanggal_terbit: string | null;
  is_revoked: boolean;
  nama: string;
  kursus: string;
  instruktur: string | null;
}

/** Data lengkap untuk merender desain sertifikat (nama, kursus, instruktur, QR, dsb). */
export async function displayById(id: string): Promise<CertificateDisplay | null> {
  return queryOne<CertificateDisplay>(
    `SELECT cert.id, cert.user_id, cert.nomor_sertifikat, cert.kode_verifikasi, cert.qr_code_url,
            cert.status, cert.tanggal_terbit, cert.is_revoked,
            u.nama_lengkap AS nama, c.judul AS kursus, iu.nama_lengkap AS instruktur
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
  nama: string;
  deskripsi: string | null;
  kriteria: unknown;
  icon_url: string | null;
  is_aktif: boolean;
}): Promise<BadgeRow> {
  const row = await queryOne<BadgeRow>(
    `INSERT INTO badges (kode, nama, deskripsi, kriteria, icon_url, is_aktif)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.kode, data.nama, data.deskripsi, JSON.stringify(data.kriteria), data.icon_url, data.is_aktif],
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
  deskripsi: string | null;
}): Promise<PointsLedgerRow> {
  const row = await queryOne<PointsLedgerRow>(
    `INSERT INTO points_ledger (user_id, jenis, jumlah, saldo_setelah, sumber_type, sumber_id, deskripsi)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.user_id, data.jenis, data.jumlah, data.saldo_setelah, data.sumber_type, data.sumber_id, data.deskripsi],
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
): Promise<Array<{ user_id: string; nama: string; poin: number }>> {
  const rows = await query<{ user_id: string; nama: string; poin: string }>(
    courseId
      ? `SELECT pl.user_id, u.nama_lengkap AS nama,
                SUM(CASE WHEN pl.jenis = 'earn' THEN pl.jumlah ELSE -pl.jumlah END) AS poin
           FROM points_ledger pl
           JOIN users u ON u.id = pl.user_id
           JOIN enrollments e ON e.user_id = pl.user_id AND e.course_id = $1 AND e.deleted_at IS NULL
          GROUP BY pl.user_id, u.nama_lengkap
          ORDER BY poin DESC`
      : `SELECT pl.user_id, u.nama_lengkap AS nama,
                SUM(CASE WHEN pl.jenis = 'earn' THEN pl.jumlah ELSE -pl.jumlah END) AS poin
           FROM points_ledger pl
           JOIN users u ON u.id = pl.user_id
          GROUP BY pl.user_id, u.nama_lengkap
          ORDER BY poin DESC`,
    courseId ? [courseId] : [],
  );
  return rows.map((r) => ({ user_id: r.user_id, nama: r.nama, poin: Number(r.poin) }));
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
