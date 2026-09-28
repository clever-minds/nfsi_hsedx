import { PoolClient } from 'pg';
import { nanoid } from 'nanoid';
import { AppError } from '../../core/http/AppError';
import { withTransaction } from '../../core/db/withTransaction';
import { recordAudit } from '../../core/audit/audit';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './marketing.repository';
import {
  ApproveCommissionInput,
  CreateLeadInput,
  CreateReferralLinkInput,
  DisburseCommissionInput,
  MoveStageInput,
  RegisterAffiliateInput,
  TargetOverrideInput,
  VerifyAffiliateInput,
} from './marketing.validation';

// Finansial: fallback rate komisi bila `marketing_categories.rate_komisi_default` &
// override tier tidak tersedia. Nilai ilustrasi (README §"Catatan angka") — final via `settings` (domain 12).
const DEFAULT_KOMISI_RATE_PERSEN = 20;

const isAdminLike = (actor: AuthContext) =>
  actor.roles.includes('super_admin') || actor.roles.includes('direktur') || actor.roles.includes('admin_ops');
const isDirektur = (actor: AuthContext) => actor.roles.includes('super_admin') || actor.roles.includes('direktur');

const TAHAP_ORDER = ['lead', 'prospek', 'closing'] as const;

// ── Affiliate profiles ──────────────────────────────────────

export async function registerAffiliate(actor: AuthContext, input: RegisterAffiliateInput) {
  const existing = await repo.affiliateProfileByUserId(actor.userId);
  if (existing) throw AppError.conflict('You are already registered as a marketing agent', 'marketing.already_an_agent');

  const category = await repo.categoryByKode(input.category_kode);
  if (!category || !category.is_aktif) throw AppError.badRequest('That marketing category is unknown or inactive', 'marketing.category_unknown');

  if (input.parent_agen_user_id === actor.userId) {
    throw AppError.badRequest('A user cannot be their own manager', 'user.cannot_be_own_manager');
  }

  const kode_agen = await repo.nextKodeAgen();
  const profile = await repo.insertAffiliateProfile({
    user_id: actor.userId,
    category_id: category.id,
    kode_agen,
    target: Number(category.target_default),
    nama_bank: input.nama_bank ?? null,
    no_rekening: input.no_rekening ?? null,
    nama_pemilik_rekening: input.nama_pemilik_rekening ?? null,
    parent_agen_user_id: input.parent_agen_user_id ?? null,
  });

  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: 'register',
    entity: 'affiliate_profiles',
    entityId: profile.id,
    after: { category_kode: input.category_kode, kode_agen },
  });
  return profile;
}

export async function verifyAffiliate(actor: AuthContext, id: string, input: VerifyAffiliateInput) {
  if (!isAdminLike(actor)) throw AppError.forbidden('Only an Admin or Director can verify an agent', 'marketing.verify_requires_admin');
  const profile = await repo.affiliateProfileById(id);
  if (!profile) throw AppError.notFound('Agent profile not found', 'marketing.agent_not_found');

  const status = input.aksi === 'approve' ? 'terverifikasi' : 'ditolak';
  await repo.updateAffiliateProfile(id, {
    status_verifikasi: status,
    verified_by: actor.userId,
    verified_at: new Date(),
    alasan_penolakan: input.aksi === 'reject' ? input.alasan ?? null : null,
    bergabung_at: input.aksi === 'approve' ? new Date() : null,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: `verify_${input.aksi}`,
    entity: 'affiliate_profiles',
    entityId: id,
    before: { status_verifikasi: profile.status_verifikasi },
    after: { status_verifikasi: status },
    reason: input.alasan ?? null,
  });
  return repo.affiliateProfileById(id);
}

export async function overrideTarget(actor: AuthContext, id: string, input: TargetOverrideInput) {
  if (!isDirektur(actor)) throw AppError.forbidden('Only a Director can change an agent\'s target', 'marketing.target_requires_director');
  const profile = await repo.affiliateProfileById(id);
  if (!profile) throw AppError.notFound('Agent profile not found', 'marketing.agent_not_found');
  await repo.updateAffiliateProfile(id, { target: input.target });
  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: 'target_override',
    entity: 'affiliate_profiles',
    entityId: id,
    before: { target: profile.target },
    after: { target: input.target },
  });
  return repo.affiliateProfileById(id);
}

export async function me(actor: AuthContext) {
  const profile = await repo.affiliateProfileByUserId(actor.userId);
  if (!profile) throw AppError.notFound('You are not registered as a marketing agent', 'marketing.not_an_agent');
  return profile;
}

export async function list(actor: AuthContext, p: PageParams, f: { status_verifikasi?: string }) {
  if (!isAdminLike(actor)) throw AppError.forbidden('You are not allowed to view all agents', 'marketing.list_all_forbidden');
  return repo.listAffiliates(p, f);
}

export async function detail(actor: AuthContext, id: string) {
  const profile = await repo.affiliateProfileById(id);
  if (!profile) throw AppError.notFound('Agent profile not found', 'marketing.agent_not_found');
  if (!isAdminLike(actor) && profile.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return profile;
}

// ── Referral links ──────────────────────────────────────────

export async function createReferralLink(actor: AuthContext, input: CreateReferralLinkInput) {
  const profile = await repo.affiliateProfileByUserId(actor.userId);
  if (!profile) throw AppError.badRequest('Register as a marketing agent first', 'marketing.register_first');
  if (profile.status_verifikasi !== 'terverifikasi') {
    throw AppError.forbidden('This agent profile has not been verified yet', 'marketing.agent_not_verified');
  }

  // kode unik pakai nanoid; retry beberapa kali bila tabrakan kode
  let link;
  for (let attempt = 0; attempt < 5; attempt++) {
    const kode = nanoid(8).toLowerCase();
    const clash = await repo.referralLinkByKode(kode);
    if (clash) continue;
    link = await repo.insertReferralLink({
      agen_user_id: actor.userId,
      kode,
      url_target: input.url_target,
      judul: input.judul ?? null,
      expires_at: input.expires_at ? new Date(input.expires_at) : null,
    });
    break;
  }
  if (!link) throw AppError.internal('Could not generate a unique referral code, please try again', 'marketing.referral_code_generation_failed');

  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: 'create_referral_link',
    entity: 'referral_links',
    entityId: link.id,
    after: { kode: link.kode, url_target: link.url_target },
  });
  return link;
}

export async function listReferralLinks(actor: AuthContext) {
  return repo.listReferralLinksByAgen(actor.userId);
}

// ── Leads / pipeline ─────────────────────────────────────────

export async function listLeads(actor: AuthContext, p: PageParams, f: { tahap?: string }) {
  const agen_user_id = isAdminLike(actor) ? undefined : actor.userId;
  return repo.listLeads(p, { ...f, agen_user_id });
}

export async function leadDetail(actor: AuthContext, id: string) {
  const lead = await repo.leadById(id);
  if (!lead) throw AppError.notFound('Lead not found', 'marketing.lead_not_found');
  if (!isAdminLike(actor) && lead.agen_user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return lead;
}

export async function createLead(actor: AuthContext, input: CreateLeadInput) {
  const lead = await repo.insertLead({
    agen_user_id: actor.userId,
    nama_calon: input.nama_calon,
    kontak: input.kontak,
    minat_course_id: input.minat_course_id ?? null,
    sumber_referral_link_id: input.sumber_referral_link_id ?? null,
    catatan: input.catatan ?? null,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'marketing',
    action: 'create_lead',
    entity: 'leads',
    entityId: lead.id,
    after: { nama_calon: input.nama_calon, kontak: input.kontak },
  });
  return lead;
}

/** Perpindahan tahap pipeline `lead → prospek → closing`; menulis `lead_stage_history`.
 * `closing` mengunci attribution `orders.marketing_user_id` pada order terkait (permanen). */
export async function moveLeadStage(actor: AuthContext, id: string, input: MoveStageInput) {
  const lead = await repo.leadById(id);
  if (!lead) throw AppError.notFound('Lead not found', 'marketing.lead_not_found');
  if (!isAdminLike(actor) && lead.agen_user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');

  const fromIdx = TAHAP_ORDER.indexOf(lead.tahap);
  const toIdx = TAHAP_ORDER.indexOf(input.tahap);
  if (toIdx === fromIdx) throw AppError.badRequest('This lead is already at that stage', 'marketing.lead_already_at_stage');
  if (toIdx < fromIdx) throw AppError.badRequest('You cannot move a lead back to an earlier stage', 'marketing.pipeline_no_rollback');
  if (toIdx > fromIdx + 1) throw AppError.badRequest('You cannot skip a pipeline stage', 'marketing.pipeline_no_skip');

  let orderId: string | null = null;
  if (input.tahap === 'closing') {
    const order = await repo.orderExists(input.order_id!);
    if (!order) throw AppError.badRequest('The referenced order was not found', 'order.referenced_not_found');
    orderId = order.id;
  }

  return withTransaction(async (tx) => {
    await repo.updateLeadStage(
      id,
      { tahap: input.tahap, order_id: orderId, closing_at: input.tahap === 'closing' ? new Date() : null, catatan: input.catatan },
      tx,
    );
    await repo.insertLeadStageHistory(
      { lead_id: id, tahap_dari: lead.tahap, tahap_ke: input.tahap, catatan: input.catatan ?? null, aktor_user_id: actor.userId },
      tx,
    );
    if (input.tahap === 'closing' && orderId) {
      // attribution terkunci — hanya mengisi bila orders.marketing_user_id masih kosong
      await repo.lockOrderAttribution(orderId, lead.agen_user_id, tx);
    }
    await recordAudit(
      {
        userId: actor.userId,
        module: 'marketing',
        action: 'lead_move_stage',
        entity: 'leads',
        entityId: id,
        before: { tahap: lead.tahap },
        after: { tahap: input.tahap, order_id: orderId },
        reason: input.catatan ?? null,
      },
      tx,
    );
    return repo.leadById(id, tx);
  });
}

// ── Commission engine (finansial) ────────────────────────

/**
 * Finansial — dipanggil oleh `orders.service` DALAM transaksi yang sama saat order menjadi Lunas.
 * Menghitung komisi dari attribution `orders.marketing_user_id`; tanpa attribution → tidak ada komisi.
 */
export async function computeCommissionOnOrderLunas(
  tx: PoolClient,
  order: { id: string; marketing_user_id: string | null; total: string | number },
): Promise<void> {
  if (!order.marketing_user_id) return; // tanpa attribution, tidak ada komisi

  const existing = await repo.commissionByOrderId(order.id, tx);
  if (existing) return; // idempoten — 1 komisi per order (unique parsial order_id)

  const profile = await repo.affiliateProfileByUserId(order.marketing_user_id);
  let rate = DEFAULT_KOMISI_RATE_PERSEN;
  let categoryId: string | null = null;
  if (profile) {
    categoryId = profile.category_id;
    const category = await repo.categoryById(profile.category_id, tx);
    if (category) rate = Number(category.rate_komisi_default);
  }

  const dasar = Number(order.total);
  const nominal = Math.round((dasar * rate) / 100);

  const commission = await repo.insertCommission(
    { agen_user_id: order.marketing_user_id, order_id: order.id, category_id: categoryId, dasar_perhitungan: dasar, rate, nominal },
    tx,
  );
  await recordAudit(
    {
      userId: null,
      module: 'komisi',
      action: 'compute',
      entity: 'commissions',
      entityId: commission.id,
      after: { order_id: order.id, rate, nominal },
    },
    tx,
  );
}

/**
 * Finansial — dipanggil oleh `orders.service` DALAM transaksi refund.
 * Komisi yang belum cair langsung dibatalkan; komisi yang sudah disetujui/cair ditandai `ditolak`
 * untuk peninjauan ulang manual (kebijakan pemulihan piutang di luar cakupan modul ini).
 */
export async function reverseCommissionOnRefund(tx: PoolClient, orderId: string, reason: string): Promise<void> {
  const commission = await repo.commissionByOrderId(orderId, tx);
  if (!commission) return;
  if (commission.status === 'ditolak' || commission.status === 'selesai') return;

  await repo.updateCommissionStatus(
    commission.id,
    { status: 'ditolak', catatan: `Dibatalkan otomatis akibat refund: ${reason}` },
    tx,
  );
  await recordAudit(
    {
      userId: null,
      module: 'komisi',
      action: 'reverse_on_refund',
      entity: 'commissions',
      entityId: commission.id,
      before: { status: commission.status },
      after: { status: 'ditolak' },
      reason,
    },
    tx,
  );
}

// ── Dashboard & leaderboard ──────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/** KPI agen: scope ke agen sendiri, kecuali staf/admin (agregat seluruh agen). */
export async function dashboard(actor: AuthContext) {
  const scopeAgenUserId = isAdminLike(actor) ? null : actor.userId;
  const stats = await repo.dashboardStats(scopeAgenUserId);
  const konversi_persen = stats.jumlah_leads > 0 ? round2((stats.jumlah_closing / stats.jumlah_leads) * 100) : 0;
  return { ...stats, konversi_persen };
}

export async function leaderboard() {
  return repo.leaderboard(10);
}

export async function listCommissions(actor: AuthContext, p: PageParams, f: { status?: string }) {
  const agen_user_id = isAdminLike(actor) ? undefined : actor.userId;
  return repo.listCommissions(p, { ...f, agen_user_id });
}

export async function commissionDetail(actor: AuthContext, id: string) {
  const c = await repo.commissionById(id);
  if (!c) throw AppError.notFound('Commission not found', 'commission.not_found');
  if (!isAdminLike(actor) && c.agen_user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return c;
}

/** dihitung → menunggu_approval (batch/manual trigger Admin Ops). */
export async function submitCommission(actor: AuthContext, id: string) {
  if (!isAdminLike(actor)) throw AppError.forbidden('You are not allowed to submit commissions', 'commission.submit_forbidden');
  const c = await repo.commissionById(id);
  if (!c) throw AppError.notFound('Commission not found', 'commission.not_found');
  if (c.status !== 'dihitung') throw AppError.conflict('This commission has not been calculated yet', 'commission.not_calculated');

  return withTransaction(async (tx) => {
    await repo.updateCommissionStatus(id, { status: 'menunggu_approval' }, tx);
    await recordAudit(
      { userId: actor.userId, module: 'komisi', action: 'submit', entity: 'commissions', entityId: id, before: { status: c.status }, after: { status: 'menunggu_approval' } },
      tx,
    );
    return repo.commissionById(id, tx);
  });
}

/** menunggu_approval → disetujui|ditolak — WAJIB Direktur (pemisahan tugas dari perhitungan sistem). */
export async function approveCommission(actor: AuthContext, id: string, input: ApproveCommissionInput) {
  if (!isDirektur(actor)) throw AppError.forbidden('Only a Director can approve a commission', 'commission.approve_requires_director');
  const c = await repo.commissionById(id);
  if (!c) throw AppError.notFound('Commission not found', 'commission.not_found');
  if (!['dihitung', 'menunggu_approval'].includes(c.status)) {
    throw AppError.conflict('This commission cannot be approved or rejected in its current state', 'commission.not_decidable');
  }

  const newStatus = input.aksi === 'approve' ? 'disetujui' : 'ditolak';
  return withTransaction(async (tx) => {
    await repo.updateCommissionStatus(
      id,
      {
        status: newStatus,
        approved_by: actor.userId,
        approved_at: new Date(),
        catatan: input.catatan ?? null,
      },
      tx,
    );
    await recordAudit(
      {
        userId: actor.userId,
        module: 'komisi',
        action: `approve_${input.aksi}`,
        entity: 'commissions',
        entityId: id,
        before: { status: c.status },
        after: { status: newStatus },
        reason: input.catatan ?? null,
      },
      tx,
    );
    return repo.commissionById(id, tx);
  });
}

/** disetujui → pencairan → selesai. */
export async function disburseCommission(actor: AuthContext, id: string, input: DisburseCommissionInput) {
  if (!isAdminLike(actor)) throw AppError.forbidden('You are not allowed to release commissions', 'commission.release_forbidden');
  const c = await repo.commissionById(id);
  if (!c) throw AppError.notFound('Commission not found', 'commission.not_found');
  if (c.status !== 'disetujui') throw AppError.conflict('A commission must be approved before it can be paid out', 'commission.must_be_approved');

  return withTransaction(async (tx) => {
    await repo.updateCommissionStatus(id, { status: 'pencairan' }, tx);
    await repo.updateCommissionStatus(
      id,
      {
        status: 'selesai',
        tanggal_cair: new Date(),
        bukti_cair: input.bukti_cair,
        catatan: input.catatan ?? c.catatan,
      },
      tx,
    );
    await recordAudit(
      {
        userId: actor.userId,
        module: 'komisi',
        action: 'disburse',
        entity: 'commissions',
        entityId: id,
        before: { status: c.status },
        after: { status: 'selesai', bukti_cair: input.bukti_cair },
      },
      tx,
    );
    return repo.commissionById(id, tx);
  });
}
