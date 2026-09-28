import { PoolClient } from 'pg';
import { query, queryOne, pool } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

export type EnrollmentSumber = 'beli' | 'assign' | 'bundle' | 'path';
export type EnrollmentStatus = 'terdaftar' | 'aktif' | 'selesai' | 'kedaluwarsa' | 'batal';
export type CohortStatus = 'direncanakan' | 'berjalan' | 'selesai' | 'dibatalkan';
export type CohortMemberStatus = 'terdaftar' | 'waitlist' | 'aktif' | 'keluar';

export interface EnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  cohort_id: string | null;
  sumber: EnrollmentSumber;
  status: EnrollmentStatus;
  order_item_id: string | null;
  assigned_by: string | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  akses_kedaluwarsa_at: string | null;
  catatan: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnrollmentListRow extends EnrollmentRow {
  siswa_nama: string | null;
  kursus_judul: string | null;
  cohort_nama: string | null;
  /** Alias dari akses_kedaluwarsa_at agar cocok dengan kolom "Akses s/d" di FE. */
  tanggal_kedaluwarsa: string | null;
}

export interface EnrollmentFilters {
  user_id?: string;
  course_id?: string;
  cohort_id?: string;
  status?: string;
  sumber?: string;
  /** Row-level: dipaksa oleh siswa (hanya miliknya sendiri). */
  ownerUserId?: string | null;
  /** Row-level: dipaksa oleh instruktur (hanya kursus miliknya). */
  instructorUserId?: string | null;
}

export interface CohortRow {
  id: string;
  course_id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string | null;
  kuota_maksimal: number | null;
  status: CohortStatus;
  created_at: string;
  updated_at: string;
}

export interface CohortMemberRow {
  id: string;
  cohort_id: string;
  user_id: string;
  status: CohortMemberStatus;
  waitlist_urutan: number | null;
  joined_at: string;
  created_at: string;
}

const whereAdd = (where: string[], params: unknown[], clause: string, val: unknown) => {
  params.push(val);
  where.push(clause.replace('$?', `$${params.length}`));
};

export async function list(p: PageParams, f: EnrollmentFilters): Promise<{ rows: EnrollmentListRow[]; total: number }> {
  const where: string[] = ['e.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.ownerUserId) whereAdd(where, params, 'e.user_id = $?', f.ownerUserId);
  else if (f.user_id) whereAdd(where, params, 'e.user_id = $?', f.user_id);
  if (f.course_id) whereAdd(where, params, 'e.course_id = $?', f.course_id);
  if (f.cohort_id) whereAdd(where, params, 'e.cohort_id = $?', f.cohort_id);
  if (f.status) whereAdd(where, params, 'e.status = $?', f.status);
  if (f.sumber) whereAdd(where, params, 'e.sumber = $?', f.sumber);
  if (f.instructorUserId) {
    whereAdd(
      where,
      params,
      'e.course_id IN (SELECT c.id FROM courses c JOIN instructor_profiles ip ON ip.id = c.instructor_id WHERE ip.user_id = $?)',
      f.instructorUserId,
    );
  }
  const whereSql = where.join(' AND ');
  const sortCol = ['created_at', 'status', 'tanggal_mulai'].includes(p.sort ?? '') ? p.sort : 'created_at';

  const rows = await query<EnrollmentListRow>(
    `SELECT e.*, u.nama_lengkap AS siswa_nama, c.judul AS kursus_judul,
            co.nama AS cohort_nama, e.akses_kedaluwarsa_at AS tanggal_kedaluwarsa
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN courses c ON c.id = e.course_id
       LEFT JOIN cohorts co ON co.id = e.cohort_id
      WHERE ${whereSql}
      ORDER BY e.${sortCol} ${p.order}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM enrollments e WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function detail(id: string): Promise<EnrollmentListRow | null> {
  return queryOne<EnrollmentListRow>(
    `SELECT e.*, u.nama_lengkap AS siswa_nama, c.judul AS kursus_judul,
            co.nama AS cohort_nama, e.akses_kedaluwarsa_at AS tanggal_kedaluwarsa
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN courses c ON c.id = e.course_id
       LEFT JOIN cohorts co ON co.id = e.cohort_id
      WHERE e.id = $1 AND e.deleted_at IS NULL`,
    [id],
  );
}

export async function findActiveByUserCourse(userId: string, courseId: string): Promise<EnrollmentRow | null> {
  return queryOne<EnrollmentRow>(
    `SELECT * FROM enrollments
      WHERE user_id = $1 AND course_id = $2 AND deleted_at IS NULL AND status <> 'batal'
      ORDER BY created_at DESC LIMIT 1`,
    [userId, courseId],
  );
}

export async function insert(
  data: {
    user_id: string;
    course_id: string;
    cohort_id: string | null;
    sumber: EnrollmentSumber;
    order_item_id: string | null;
    assigned_by: string | null;
    akses_kedaluwarsa_at: string | null;
    catatan: string | null;
  },
  tx?: PoolClient,
): Promise<{ id: string }> {
  const runner = tx ?? pool;
  const row = await runner.query<{ id: string }>(
    `INSERT INTO enrollments (user_id, course_id, cohort_id, sumber, status, order_item_id, assigned_by, akses_kedaluwarsa_at, catatan)
     VALUES ($1,$2,$3,$4,'terdaftar',$5,$6,$7,$8) RETURNING id`,
    [data.user_id, data.course_id, data.cohort_id, data.sumber, data.order_item_id, data.assigned_by, data.akses_kedaluwarsa_at, data.catatan],
  );
  return row.rows[0];
}

export async function updateStatus(id: string, status: EnrollmentStatus, extra: Record<string, unknown> = {}): Promise<void> {
  const fields: Record<string, unknown> = { status, ...extra };
  const keys = Object.keys(fields);
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE enrollments SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function setCohort(id: string, cohortId: string | null): Promise<void> {
  await query(`UPDATE enrollments SET cohort_id = $2 WHERE id = $1`, [id, cohortId]);
}

/** Dipanggil modul lain (progress) saat siswa membuka pelajaran pertama: Terdaftar → Aktif. */
export async function activateIfTerdaftar(id: string): Promise<void> {
  await query(
    `UPDATE enrollments SET status = 'aktif', tanggal_mulai = COALESCE(tanggal_mulai, now())
      WHERE id = $1 AND status = 'terdaftar' AND deleted_at IS NULL`,
    [id],
  );
}

export async function markSelesai(id: string): Promise<void> {
  await query(
    `UPDATE enrollments SET status = 'selesai', tanggal_selesai = now()
      WHERE id = $1 AND status = 'aktif' AND deleted_at IS NULL`,
    [id],
  );
}

// ── Cohorts ─────────────────────────────────────────────

export async function listCohorts(courseId: string): Promise<CohortRow[]> {
  return query<CohortRow>(
    `SELECT * FROM cohorts WHERE course_id = $1 AND deleted_at IS NULL ORDER BY tanggal_mulai DESC`,
    [courseId],
  );
}

export interface CohortListRow extends CohortRow {
  course_judul: string | null;
  jumlah_anggota: number;
}

/** Semua cohort lintas kursus + judul kursus & jumlah anggota aktif (untuk halaman admin/manajemen cohort). */
export async function listAllCohorts(p: PageParams): Promise<{ rows: CohortListRow[]; total: number }> {
  const rows = await query<CohortListRow>(
    `SELECT co.*, c.judul AS course_judul,
            (SELECT COUNT(*)::int FROM cohort_members cm
              WHERE cm.cohort_id = co.id AND cm.status IN ('terdaftar','aktif')) AS jumlah_anggota
       FROM cohorts co
       LEFT JOIN courses c ON c.id = co.course_id
      WHERE co.deleted_at IS NULL
      ORDER BY co.created_at DESC
      LIMIT ${p.limit} OFFSET ${p.offset}`,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM cohorts WHERE deleted_at IS NULL`,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

/** Anggota cohort berstatus waitlist (FIFO), dengan nama pengguna. */
export async function listCohortWaitlist(cohortId: string): Promise<Array<CohortMemberRow & { nama_lengkap: string }>> {
  return query<CohortMemberRow & { nama_lengkap: string }>(
    `SELECT cm.*, u.nama_lengkap
       FROM cohort_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.cohort_id = $1 AND cm.status = 'waitlist'
      ORDER BY cm.waitlist_urutan NULLS LAST, cm.joined_at`,
    [cohortId],
  );
}

export async function getCohortMemberById(id: string, tx?: PoolClient): Promise<CohortMemberRow | null> {
  const runner = tx ?? pool;
  const res = await runner.query<CohortMemberRow>(`SELECT * FROM cohort_members WHERE id = $1`, [id]);
  return res.rows[0] ?? null;
}

export async function cohortDetail(id: string, tx?: PoolClient): Promise<CohortRow | null> {
  const runner = tx ?? pool;
  const res = await runner.query<CohortRow>(`SELECT * FROM cohorts WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return res.rows[0] ?? null;
}

/** Kunci baris cohort untuk transaksi (hindari race condition kuota/waitlist). */
export async function lockCohort(id: string, tx: PoolClient): Promise<CohortRow | null> {
  const res = await tx.query<CohortRow>(`SELECT * FROM cohorts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [id]);
  return res.rows[0] ?? null;
}

export async function insertCohort(data: {
  course_id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string | null;
  kuota_maksimal: number | null;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO cohorts (course_id, nama, tanggal_mulai, tanggal_selesai, kuota_maksimal, status)
     VALUES ($1,$2,$3,$4,$5,'direncanakan') RETURNING id`,
    [data.course_id, data.nama, data.tanggal_mulai, data.tanggal_selesai, data.kuota_maksimal],
  );
  return row!;
}

export async function updateCohort(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE cohorts SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function countActiveCohortMembers(cohortId: string, tx?: PoolClient): Promise<number> {
  const runner = tx ?? pool;
  const res = await runner.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM cohort_members WHERE cohort_id = $1 AND status IN ('terdaftar','aktif')`,
    [cohortId],
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function listCohortMembers(cohortId: string): Promise<Array<CohortMemberRow & { nama_lengkap: string }>> {
  return query<CohortMemberRow & { nama_lengkap: string }>(
    `SELECT cm.*, u.nama_lengkap
       FROM cohort_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.cohort_id = $1
      ORDER BY (cm.status = 'waitlist') , cm.waitlist_urutan NULLS LAST, cm.joined_at`,
    [cohortId],
  );
}

export async function findCohortMember(cohortId: string, userId: string, tx?: PoolClient): Promise<CohortMemberRow | null> {
  const runner = tx ?? pool;
  const res = await runner.query<CohortMemberRow>(
    `SELECT * FROM cohort_members WHERE cohort_id = $1 AND user_id = $2`,
    [cohortId, userId],
  );
  return res.rows[0] ?? null;
}

export async function insertCohortMember(
  data: { cohort_id: string; user_id: string; status: CohortMemberStatus; waitlist_urutan: number | null },
  tx?: PoolClient,
): Promise<{ id: string }> {
  const runner = tx ?? pool;
  const res = await runner.query<{ id: string }>(
    `INSERT INTO cohort_members (cohort_id, user_id, status, waitlist_urutan)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [data.cohort_id, data.user_id, data.status, data.waitlist_urutan],
  );
  return res.rows[0];
}

export async function nextWaitlistPosition(cohortId: string, tx: PoolClient): Promise<number> {
  const res = await tx.query<{ next: number }>(
    `SELECT COALESCE(MAX(waitlist_urutan), 0) + 1 AS next FROM cohort_members WHERE cohort_id = $1 AND status = 'waitlist'`,
    [cohortId],
  );
  return res.rows[0]?.next ?? 1;
}

export async function topWaitlisted(cohortId: string, limit: number, tx: PoolClient): Promise<CohortMemberRow[]> {
  const res = await tx.query<CohortMemberRow>(
    `SELECT * FROM cohort_members WHERE cohort_id = $1 AND status = 'waitlist'
      ORDER BY waitlist_urutan NULLS LAST, joined_at LIMIT $2`,
    [cohortId, limit],
  );
  return res.rows;
}

export async function promoteCohortMember(id: string, tx: PoolClient): Promise<void> {
  await tx.query(`UPDATE cohort_members SET status = 'aktif', waitlist_urutan = NULL WHERE id = $1`, [id]);
}
