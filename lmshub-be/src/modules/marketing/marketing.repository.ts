import { PoolClient } from 'pg';
import { pool, query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

const runner = (tx?: PoolClient) => tx ?? pool;

// ── Tipe baris ──────────────────────────────────────────────

export interface MarketingCategoryRow {
  id: string;
  kode: string;
  nama: string;
  target_default: string;
  target_satuan: string;
  rate_komisi_default: string;
  is_aktif: boolean;
}

export interface AffiliateProfileRow {
  id: string;
  user_id: string;
  category_id: string;
  kode_agen: string;
  target: string;
  status_verifikasi: 'menunggu' | 'terverifikasi' | 'ditolak';
  verified_by: string | null;
  verified_at: string | null;
  alasan_penolakan: string | null;
  nama_bank: string | null;
  no_rekening: string | null;
  nama_pemilik_rekening: string | null;
  parent_agen_user_id: string | null;
  bergabung_at: string | null;
  created_at: string;
}

export interface ReferralLinkRow {
  id: string;
  agen_user_id: string;
  kode: string;
  url_target: string;
  judul: string | null;
  jumlah_kunjungan: string;
  jumlah_konversi: string;
  is_aktif: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface LeadRow {
  id: string;
  agen_user_id: string;
  nama_calon: string;
  kontak: string;
  minat_course_id: string | null;
  tahap: 'lead' | 'prospek' | 'closing';
  catatan: string | null;
  sumber_referral_link_id: string | null;
  order_id: string | null;
  closing_at: string | null;
  created_at: string;
}

export interface CommissionRow {
  id: string;
  agen_user_id: string;
  order_id: string;
  category_id: string | null;
  dasar_perhitungan: string;
  rate: string;
  nominal: string;
  status: 'dihitung' | 'menunggu_approval' | 'disetujui' | 'pencairan' | 'selesai' | 'ditolak';
  approved_by: string | null;
  approved_at: string | null;
  tanggal_cair: string | null;
  bukti_cair: string | null;
  catatan: string | null;
  created_at: string;
}

// ── Marketing categories (read-only di sini, master di domain katalog) ──

export async function categoryByKode(kode: string): Promise<MarketingCategoryRow | null> {
  return queryOne<MarketingCategoryRow>(`SELECT * FROM marketing_categories WHERE kode = $1 AND deleted_at IS NULL`, [
    kode,
  ]);
}

export async function categoryById(id: string, tx?: PoolClient): Promise<MarketingCategoryRow | null> {
  const res = await runner(tx).query<MarketingCategoryRow>(
    `SELECT * FROM marketing_categories WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return res.rows[0] ?? null;
}

// ── Affiliate profiles ──────────────────────────────────────

export async function affiliateProfileByUserId(userId: string): Promise<AffiliateProfileRow | null> {
  return queryOne<AffiliateProfileRow>(`SELECT * FROM affiliate_profiles WHERE user_id = $1 AND deleted_at IS NULL`, [
    userId,
  ]);
}

export async function affiliateProfileById(id: string): Promise<AffiliateProfileRow | null> {
  return queryOne<AffiliateProfileRow>(`SELECT * FROM affiliate_profiles WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function listAffiliates(
  p: PageParams,
  f: { status_verifikasi?: string },
): Promise<{ rows: AffiliateProfileRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.status_verifikasi) {
    params.push(f.status_verifikasi);
    where.push(`status_verifikasi = $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const rows = await query<AffiliateProfileRow>(
    `SELECT * FROM affiliate_profiles WHERE ${whereSql} ORDER BY created_at ${p.order} LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM affiliate_profiles WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function insertAffiliateProfile(
  data: {
    user_id: string;
    category_id: string;
    kode_agen: string;
    target: number;
    nama_bank: string | null;
    no_rekening: string | null;
    nama_pemilik_rekening: string | null;
    parent_agen_user_id: string | null;
  },
  tx?: PoolClient,
): Promise<AffiliateProfileRow> {
  const res = await runner(tx).query<AffiliateProfileRow>(
    `INSERT INTO affiliate_profiles (user_id, category_id, kode_agen, target, nama_bank, no_rekening, nama_pemilik_rekening, parent_agen_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.user_id,
      data.category_id,
      data.kode_agen,
      data.target,
      data.nama_bank,
      data.no_rekening,
      data.nama_pemilik_rekening,
      data.parent_agen_user_id,
    ],
  );
  return res.rows[0];
}

export async function nextKodeAgen(): Promise<string> {
  const row = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM affiliate_profiles`);
  const seq = Number(row?.count ?? 0) + 1;
  return `AGN-${String(seq).padStart(4, '0')}`;
}

export async function updateAffiliateProfile(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE affiliate_profiles SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

// ── Referral links ──────────────────────────────────────────

export async function insertReferralLink(
  data: { agen_user_id: string; kode: string; url_target: string; judul: string | null; expires_at: Date | null },
): Promise<ReferralLinkRow> {
  const row = await queryOne<ReferralLinkRow>(
    `INSERT INTO referral_links (agen_user_id, kode, url_target, judul, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.agen_user_id, data.kode, data.url_target, data.judul, data.expires_at],
  );
  return row!;
}

export async function referralLinkByKode(kode: string): Promise<ReferralLinkRow | null> {
  return queryOne<ReferralLinkRow>(`SELECT * FROM referral_links WHERE kode = $1 AND deleted_at IS NULL`, [kode]);
}

export async function listReferralLinksByAgen(agenUserId: string): Promise<ReferralLinkRow[]> {
  return query<ReferralLinkRow>(
    `SELECT * FROM referral_links WHERE agen_user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [agenUserId],
  );
}

// ── Leads & pipeline ─────────────────────────────────────────

export async function listLeads(
  p: PageParams,
  f: { agen_user_id?: string; tahap?: string },
): Promise<{ rows: LeadRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.agen_user_id) add('agen_user_id = $?', f.agen_user_id);
  if (f.tahap) add('tahap = $?', f.tahap);
  const whereSql = where.join(' AND ');
  const rows = await query<LeadRow>(
    `SELECT * FROM leads WHERE ${whereSql} ORDER BY created_at ${p.order} LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM leads WHERE ${whereSql}`, params);
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function leadById(id: string, tx?: PoolClient): Promise<LeadRow | null> {
  const res = await runner(tx).query<LeadRow>(`SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL`, [id]);
  return res.rows[0] ?? null;
}

export async function insertLead(data: {
  agen_user_id: string;
  nama_calon: string;
  kontak: string;
  minat_course_id: string | null;
  sumber_referral_link_id: string | null;
  catatan: string | null;
}): Promise<LeadRow> {
  const row = await queryOne<LeadRow>(
    `INSERT INTO leads (agen_user_id, nama_calon, kontak, minat_course_id, sumber_referral_link_id, catatan)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.agen_user_id, data.nama_calon, data.kontak, data.minat_course_id, data.sumber_referral_link_id, data.catatan],
  );
  return row!;
}

export async function updateLeadStage(
  id: string,
  data: { tahap: LeadRow['tahap']; order_id: string | null; closing_at: Date | null; catatan?: string | null },
  tx: PoolClient,
): Promise<void> {
  await tx.query(
    `UPDATE leads SET tahap = $2, order_id = COALESCE($3, order_id), closing_at = COALESCE($4, closing_at),
            catatan = COALESCE($5, catatan)
      WHERE id = $1`,
    [id, data.tahap, data.order_id, data.closing_at, data.catatan ?? null],
  );
}

export async function insertLeadStageHistory(
  data: { lead_id: string; tahap_dari: string | null; tahap_ke: string; catatan: string | null; aktor_user_id: string },
  tx: PoolClient,
): Promise<void> {
  await tx.query(
    `INSERT INTO lead_stage_history (lead_id, tahap_dari, tahap_ke, catatan, aktor_user_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [data.lead_id, data.tahap_dari, data.tahap_ke, data.catatan, data.aktor_user_id],
  );
}

/** Attribution terkunci: isi `orders.marketing_user_id` hanya bila masih NULL. */
export async function lockOrderAttribution(orderId: string, agenUserId: string, tx: PoolClient): Promise<void> {
  await tx.query(`UPDATE orders SET marketing_user_id = COALESCE(marketing_user_id, $2) WHERE id = $1`, [
    orderId,
    agenUserId,
  ]);
}

export async function orderExists(orderId: string, tx?: PoolClient): Promise<{ id: string; status: string; total: string; marketing_user_id: string | null } | null> {
  const res = await runner(tx).query<{ id: string; status: string; total: string; marketing_user_id: string | null }>(
    `SELECT id, status, total, marketing_user_id FROM orders WHERE id = $1 AND deleted_at IS NULL`,
    [orderId],
  );
  return res.rows[0] ?? null;
}

// ── Commissions (finansial) ──────────────────────────────

export async function commissionByOrderId(orderId: string, tx?: PoolClient): Promise<CommissionRow | null> {
  const res = await runner(tx).query<CommissionRow>(
    `SELECT * FROM commissions WHERE order_id = $1 AND deleted_at IS NULL`,
    [orderId],
  );
  return res.rows[0] ?? null;
}

export async function insertCommission(
  data: {
    agen_user_id: string;
    order_id: string;
    category_id: string | null;
    dasar_perhitungan: number;
    rate: number;
    nominal: number;
  },
  tx: PoolClient,
): Promise<CommissionRow> {
  const res = await tx.query<CommissionRow>(
    `INSERT INTO commissions (agen_user_id, order_id, category_id, dasar_perhitungan, rate, nominal, status)
     VALUES ($1,$2,$3,$4,$5,$6,'dihitung') RETURNING *`,
    [data.agen_user_id, data.order_id, data.category_id, data.dasar_perhitungan, data.rate, data.nominal],
  );
  return res.rows[0];
}

export async function commissionById(id: string, tx?: PoolClient): Promise<CommissionRow | null> {
  const res = await runner(tx).query<CommissionRow>(`SELECT * FROM commissions WHERE id = $1 AND deleted_at IS NULL`, [
    id,
  ]);
  return res.rows[0] ?? null;
}

export async function listCommissions(
  p: PageParams,
  f: { agen_user_id?: string; status?: string },
): Promise<{ rows: CommissionRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.agen_user_id) add('agen_user_id = $?', f.agen_user_id);
  if (f.status) add('status = $?', f.status);
  const whereSql = where.join(' AND ');
  const rows = await query<CommissionRow>(
    `SELECT * FROM commissions WHERE ${whereSql} ORDER BY created_at ${p.order} LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM commissions WHERE ${whereSql}`, params);
  return { rows, total: Number(totalRow?.count ?? 0) };
}

// ── Dashboard & leaderboard ──────────────────────────────────

export interface DashboardStatsRow {
  target: number;
  jumlah_leads: number;
  jumlah_prospek: number;
  jumlah_closing: number;
  total_komisi: number;
  komisi_cair: number;
}

/** Bila `agenUserId` null → agregasi seluruh agen (staf/admin). */
export async function dashboardStats(agenUserId: string | null): Promise<DashboardStatsRow> {
  const targetRow = agenUserId
    ? await queryOne<{ target: string }>(
        `SELECT COALESCE(target, 0) AS target FROM affiliate_profiles WHERE user_id = $1 AND deleted_at IS NULL`,
        [agenUserId],
      )
    : await queryOne<{ target: string }>(
        `SELECT COALESCE(SUM(target), 0) AS target FROM affiliate_profiles WHERE deleted_at IS NULL`,
      );

  const leadsRow = agenUserId
    ? await queryOne<{ jumlah_leads: string; jumlah_prospek: string; jumlah_closing: string }>(
        `SELECT COUNT(*)::int AS jumlah_leads,
                COUNT(*) FILTER (WHERE tahap = 'prospek')::int AS jumlah_prospek,
                COUNT(*) FILTER (WHERE tahap = 'closing')::int AS jumlah_closing
           FROM leads WHERE agen_user_id = $1 AND deleted_at IS NULL`,
        [agenUserId],
      )
    : await queryOne<{ jumlah_leads: string; jumlah_prospek: string; jumlah_closing: string }>(
        `SELECT COUNT(*)::int AS jumlah_leads,
                COUNT(*) FILTER (WHERE tahap = 'prospek')::int AS jumlah_prospek,
                COUNT(*) FILTER (WHERE tahap = 'closing')::int AS jumlah_closing
           FROM leads WHERE deleted_at IS NULL`,
      );

  const komisiRow = agenUserId
    ? await queryOne<{ total_komisi: string; komisi_cair: string }>(
        `SELECT COALESCE(SUM(nominal), 0) AS total_komisi,
                COALESCE(SUM(nominal) FILTER (WHERE status = 'selesai'), 0) AS komisi_cair
           FROM commissions WHERE agen_user_id = $1 AND deleted_at IS NULL`,
        [agenUserId],
      )
    : await queryOne<{ total_komisi: string; komisi_cair: string }>(
        `SELECT COALESCE(SUM(nominal), 0) AS total_komisi,
                COALESCE(SUM(nominal) FILTER (WHERE status = 'selesai'), 0) AS komisi_cair
           FROM commissions WHERE deleted_at IS NULL`,
      );

  return {
    target: Number(targetRow?.target ?? 0),
    jumlah_leads: Number(leadsRow?.jumlah_leads ?? 0),
    jumlah_prospek: Number(leadsRow?.jumlah_prospek ?? 0),
    jumlah_closing: Number(leadsRow?.jumlah_closing ?? 0),
    total_komisi: Number(komisiRow?.total_komisi ?? 0),
    komisi_cair: Number(komisiRow?.komisi_cair ?? 0),
  };
}

export interface LeaderboardRow {
  agen_nama: string;
  jumlah_closing: number;
  total_komisi: number;
}

export async function leaderboard(limit: number): Promise<LeaderboardRow[]> {
  return query<LeaderboardRow>(
    `SELECT u.nama_lengkap AS agen_nama,
            COALESCE(lc.jumlah_closing, 0)::int AS jumlah_closing,
            COALESCE(cc.total_komisi, 0) AS total_komisi
       FROM affiliate_profiles ap
       JOIN users u ON u.id = ap.user_id
       LEFT JOIN (
         SELECT agen_user_id, COUNT(*)::int AS jumlah_closing
           FROM leads
          WHERE tahap = 'closing' AND deleted_at IS NULL
          GROUP BY agen_user_id
       ) lc ON lc.agen_user_id = ap.user_id
       LEFT JOIN (
         SELECT agen_user_id, COALESCE(SUM(nominal), 0) AS total_komisi
           FROM commissions
          WHERE deleted_at IS NULL
          GROUP BY agen_user_id
       ) cc ON cc.agen_user_id = ap.user_id
      WHERE ap.deleted_at IS NULL
      ORDER BY total_komisi DESC NULLS LAST
      LIMIT $1`,
    [limit],
  );
}

export async function updateCommissionStatus(
  id: string,
  fields: Record<string, unknown>,
  tx: PoolClient,
): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await tx.query(`UPDATE commissions SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}
