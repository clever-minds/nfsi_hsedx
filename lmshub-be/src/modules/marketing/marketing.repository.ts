import { PoolClient } from 'pg';
import { pool, query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

const runner = (tx?: PoolClient) => tx ?? pool;

// ── Tipe baris ──────────────────────────────────────────────

export interface MarketingCategoryRow {
  id: string;
  kode: string;
  name: string;
  target_default: string;
  target_unit: string;
  rate_commission_default: string;
  is_active: boolean;
}

export interface AffiliateProfileRow {
  id: string;
  user_id: string;
  category_id: string;
  agent_code: string;
  target: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  bank_name: string | null;
  no_account: string | null;
  account_owner_name: string | null;
  parent_agent_user_id: string | null;
  joined_at: string | null;
  created_at: string;
}

export interface ReferralLinkRow {
  id: string;
  agent_user_id: string;
  kode: string;
  target_url: string;
  title: string | null;
  visit_count: string;
  conversion_count: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface LeadRow {
  id: string;
  agent_user_id: string;
  lead_name: string;
  kontak: string;
  interested_course_id: string | null;
  stage: 'lead' | 'prospect' | 'closing';
  notes: string | null;
  source_referral_link_id: string | null;
  order_id: string | null;
  closing_at: string | null;
  created_at: string;
}

export interface CommissionRow {
  id: string;
  agent_user_id: string;
  order_id: string;
  category_id: string | null;
  calculation_base: string;
  rate: string;
  amount: string;
  status: 'calculated' | 'awaiting_approval' | 'approved' | 'disbursement' | 'completed' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  disbursement_date: string | null;
  disbursement_proof: string | null;
  notes: string | null;
  created_at: string;
}

// ── Marketing categories (read-only di sini, master di domain catalog) ──

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
  f: { verification_status?: string },
): Promise<{ rows: AffiliateProfileRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.verification_status) {
    params.push(f.verification_status);
    where.push(`verification_status = $${params.length}`);
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
    agent_code: string;
    target: number;
    bank_name: string | null;
    no_account: string | null;
    account_owner_name: string | null;
    parent_agent_user_id: string | null;
  },
  tx?: PoolClient,
): Promise<AffiliateProfileRow> {
  const res = await runner(tx).query<AffiliateProfileRow>(
    `INSERT INTO affiliate_profiles (user_id, category_id, agent_code, target, bank_name, no_account, account_owner_name, parent_agent_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      data.user_id,
      data.category_id,
      data.agent_code,
      data.target,
      data.bank_name,
      data.no_account,
      data.account_owner_name,
      data.parent_agent_user_id,
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
  data: { agent_user_id: string; kode: string; target_url: string; title: string | null; expires_at: Date | null },
): Promise<ReferralLinkRow> {
  const row = await queryOne<ReferralLinkRow>(
    `INSERT INTO referral_links (agent_user_id, kode, target_url, title, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.agent_user_id, data.kode, data.target_url, data.title, data.expires_at],
  );
  return row!;
}

export async function referralLinkByKode(kode: string): Promise<ReferralLinkRow | null> {
  return queryOne<ReferralLinkRow>(`SELECT * FROM referral_links WHERE kode = $1 AND deleted_at IS NULL`, [kode]);
}

export async function listReferralLinksByAgen(agenUserId: string): Promise<ReferralLinkRow[]> {
  return query<ReferralLinkRow>(
    `SELECT * FROM referral_links WHERE agent_user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [agenUserId],
  );
}

// ── Leads & pipeline ─────────────────────────────────────────

export async function listLeads(
  p: PageParams,
  f: { agent_user_id?: string; stage?: string },
): Promise<{ rows: LeadRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.agent_user_id) add('agent_user_id = $?', f.agent_user_id);
  if (f.stage) add('stage = $?', f.stage);
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
  agent_user_id: string;
  lead_name: string;
  kontak: string;
  interested_course_id: string | null;
  source_referral_link_id: string | null;
  notes: string | null;
}): Promise<LeadRow> {
  const row = await queryOne<LeadRow>(
    `INSERT INTO leads (agent_user_id, lead_name, kontak, interested_course_id, source_referral_link_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.agent_user_id, data.lead_name, data.kontak, data.interested_course_id, data.source_referral_link_id, data.notes],
  );
  return row!;
}

export async function updateLeadStage(
  id: string,
  data: { stage: LeadRow['stage']; order_id: string | null; closing_at: Date | null; notes?: string | null },
  tx: PoolClient,
): Promise<void> {
  await tx.query(
    `UPDATE leads SET stage = $2, order_id = COALESCE($3, order_id), closing_at = COALESCE($4, closing_at),
            notes = COALESCE($5, notes)
      WHERE id = $1`,
    [id, data.stage, data.order_id, data.closing_at, data.notes ?? null],
  );
}

export async function insertLeadStageHistory(
  data: { lead_id: string; stage_from: string | null; stage_to: string; notes: string | null; actor_user_id: string },
  tx: PoolClient,
): Promise<void> {
  await tx.query(
    `INSERT INTO lead_stage_history (lead_id, stage_from, stage_to, notes, actor_user_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [data.lead_id, data.stage_from, data.stage_to, data.notes, data.actor_user_id],
  );
}

/** Attribution terkunci: content `orders.marketing_user_id` hanya bila masih NULL. */
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
    agent_user_id: string;
    order_id: string;
    category_id: string | null;
    calculation_base: number;
    rate: number;
    amount: number;
  },
  tx: PoolClient,
): Promise<CommissionRow> {
  const res = await tx.query<CommissionRow>(
    `INSERT INTO commissions (agent_user_id, order_id, category_id, calculation_base, rate, amount, status)
     VALUES ($1,$2,$3,$4,$5,$6,'calculated') RETURNING *`,
    [data.agent_user_id, data.order_id, data.category_id, data.calculation_base, data.rate, data.amount],
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
  f: { agent_user_id?: string; status?: string },
): Promise<{ rows: CommissionRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.agent_user_id) add('agent_user_id = $?', f.agent_user_id);
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
  amount_leads: number;
  amount_prospek: number;
  amount_closing: number;
  total_commission: number;
  commission_cair: number;
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
    ? await queryOne<{ amount_leads: string; amount_prospek: string; amount_closing: string }>(
        `SELECT COUNT(*)::int AS amount_leads,
                COUNT(*) FILTER (WHERE stage = 'prospect')::int AS amount_prospek,
                COUNT(*) FILTER (WHERE stage = 'closing')::int AS amount_closing
           FROM leads WHERE agent_user_id = $1 AND deleted_at IS NULL`,
        [agenUserId],
      )
    : await queryOne<{ amount_leads: string; amount_prospek: string; amount_closing: string }>(
        `SELECT COUNT(*)::int AS amount_leads,
                COUNT(*) FILTER (WHERE stage = 'prospect')::int AS amount_prospek,
                COUNT(*) FILTER (WHERE stage = 'closing')::int AS amount_closing
           FROM leads WHERE deleted_at IS NULL`,
      );

  const komisiRow = agenUserId
    ? await queryOne<{ total_commission: string; commission_cair: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total_commission,
                COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS commission_cair
           FROM commissions WHERE agent_user_id = $1 AND deleted_at IS NULL`,
        [agenUserId],
      )
    : await queryOne<{ total_commission: string; commission_cair: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total_commission,
                COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS commission_cair
           FROM commissions WHERE deleted_at IS NULL`,
      );

  return {
    target: Number(targetRow?.target ?? 0),
    amount_leads: Number(leadsRow?.amount_leads ?? 0),
    amount_prospek: Number(leadsRow?.amount_prospek ?? 0),
    amount_closing: Number(leadsRow?.amount_closing ?? 0),
    total_commission: Number(komisiRow?.total_commission ?? 0),
    commission_cair: Number(komisiRow?.commission_cair ?? 0),
  };
}

export interface LeaderboardRow {
  agen_name: string;
  amount_closing: number;
  total_commission: number;
}

export async function leaderboard(limit: number): Promise<LeaderboardRow[]> {
  return query<LeaderboardRow>(
    `SELECT u.name_lengkap AS agen_name,
            COALESCE(lc.amount_closing, 0)::int AS amount_closing,
            COALESCE(cc.total_commission, 0) AS total_commission
       FROM affiliate_profiles ap
       JOIN users u ON u.id = ap.user_id
       LEFT JOIN (
         SELECT agent_user_id, COUNT(*)::int AS amount_closing
           FROM leads
          WHERE stage = 'closing' AND deleted_at IS NULL
          GROUP BY agent_user_id
       ) lc ON lc.agent_user_id = ap.user_id
       LEFT JOIN (
         SELECT agent_user_id, COALESCE(SUM(amount), 0) AS total_commission
           FROM commissions
          WHERE deleted_at IS NULL
          GROUP BY agent_user_id
       ) cc ON cc.agent_user_id = ap.user_id
      WHERE ap.deleted_at IS NULL
      ORDER BY total_commission DESC NULLS LAST
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
