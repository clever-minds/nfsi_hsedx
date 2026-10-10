import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { withTransaction } from '../../core/db/withTransaction';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './reports.repository';
import { ApprovePayoutInput, CreateFinancialEntryInput, CreateReviewInput } from './reports.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isDirektur = (actor: AuthContext) => actor.roles.includes('director') || isSuper(actor);
const isAdminLike = (actor: AuthContext) => isDirektur(actor) || actor.roles.includes('operations_admin');

// ── financial_entries ────────────────────────────────────────────────────

export async function listFinancialEntries(p: PageParams, f: repo.FinancialEntryFilters) {
  return repo.listFinancialEntries(p, f);
}

export async function createFinancialEntry(actor: AuthContext, input: CreateFinancialEntryInput) {
  const category = await repo.getKategoriBiaya(input.category_id);
  if (!category) throw AppError.badRequest('Expense category not found', 'finance.category_not_found');
  if (category.type !== input.type) {
    throw AppError.badRequest('The entry type does not match the selected category', 'finance.entry_type_mismatch');
  }
  const tgl = new Date(input.date);
  const { id } = await repo.insertFinancialEntry({
    type: input.type,
    category_id: input.category_id,
    course_id: input.course_id ?? null,
    amount: input.amount,
    proof: input.proof ?? null,
    date: input.date,
    period_month: tgl.getUTCMonth() + 1,
    period_year: tgl.getUTCFullYear(),
    description: input.description ?? null,
    recorded_by: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'finance',
    action: 'create_financial_entry',
    entity: 'financial_entries',
    entityId: id,
    after: input,
  });
  return { id };
}

// ── report arus kas & laba ───────────────────────────────────────────────

export async function cashflow(f: { from?: string; until?: string }) {
  const rows = await repo.cashflowByPeriod(f);
  return rows.map((r) => ({
    period: `${r.period_year}-${String(r.period_month).padStart(2, '0')}`,
    pemasukan: Number(r.pemasukan),
    pengeluaran: Number(r.pengeluaran),
    laba: Number(r.pemasukan) - Number(r.pengeluaran),
  }));
}

/** Stub ekspor: mengembalikan JSON data report (rendering PDF/Excel di luar cakupan). */
export async function exportReport(f: { from?: string; until?: string }) {
  const data = await cashflow(f);
  return {
    format: 'json' as const,
    notes: 'PDF/Excel export is not implemented yet; returning raw data.',
    generated_at: new Date().toISOString(),
    data,
  };
}

// ── instructor_payouts ───────────────────────────────────────────────────

export async function listPayouts(actor: AuthContext, p: PageParams, status?: string) {
  const seesAll = isDirektur(actor) || actor.roles.includes('chairperson') || actor.roles.includes('supervisor');
  // Instructor: scope to instructor_profiles.id miliknya (bukan user id — kolom instructor_id
  // di instructor_payouts mereferensikan instructor_profiles.id).
  const instructorId = seesAll ? undefined : (await repo.instructorProfileIdByUser(actor.userId)) ?? '__none__';
  const [register, totalPending] = await Promise.all([
    repo.listPayouts(p, { status, instructorId }),
    // Sengaja no ikut filter status: kartu KPI menampilkan total antrean
    // persetujuan, apa pun filter yang sedang dipilih user.
    repo.sumPendingPayouts({ instructorId }),
  ]);
  return { ...register, totalPending };
}

/** Saldo revenue share instructor yang tersedia untuk dicairkan. */
export async function availablePayout(actor: AuthContext) {
  const ipId = await repo.instructorProfileIdByUser(actor.userId);
  if (!ipId) return { amount_tersedia: 0, amount_item: 0 };
  const { amount, count } = await repo.availableSharesByInstructor(ipId);
  return { amount_tersedia: amount, amount_item: count };
}

/** Instructor mengajukan pencairan seluruh saldo tersedia → payout status 'awaiting_approval'. */
export async function requestPayout(actor: AuthContext) {
  const ipId = await repo.instructorProfileIdByUser(actor.userId);
  if (!ipId) throw AppError.forbidden('Only an instructor can request a payout', 'payout.request_requires_instructor');
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  try {
    const payout = await withTransaction((tx) => repo.createPayoutFromShares(tx, ipId, actor.userId, period));
    await recordAudit({
      userId: actor.userId,
      module: 'payout',
      action: 'ajukan',
      entity: 'instructor_payouts',
      entityId: payout.id,
      after: { total_amount: payout.total_amount, status: payout.status },
    });
    return payout;
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_BALANCE') {
      throw AppError.badRequest('There is nothing available to withdraw right now', 'payout.nothing_to_withdraw');
    }
    throw e;
  }
}

/** Approval payout instructor — HANYA Direktur (atau super_admin). Transaction + row-lock cegah approve ganda. */
export async function approvePayout(actor: AuthContext, id: string, input: ApprovePayoutInput) {
  if (!isDirektur(actor)) {
    throw AppError.forbidden('Only a Director can approve a payout', 'payout.approve_requires_director');
  }
  return withTransaction(async (tx) => {
    const payout = await repo.getPayoutForUpdate(tx, id);
    if (!payout) throw AppError.notFound('Payout not found', 'payout.not_found');
    if (payout.status !== 'awaiting_approval' && payout.status !== 'calculated') {
      throw AppError.conflict(`Payout is in status '${payout.status}' and cannot be processed again`, 'payout.not_reprocessable');
    }
    const newStatus = input.action === 'approve' ? 'approved' : 'rejected';
    await repo.setPayoutStatus(tx, id, newStatus, actor.userId, input.notes_approval ?? null);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'payout',
        action: `approve_${input.action}`,
        entity: 'instructor_payouts',
        entityId: id,
        before: { status: payout.status },
        after: { status: newStatus },
        reason: input.notes_approval ?? null,
      },
      tx,
    );
    return repo.getPayout(id, tx);
  });
}

/**
 * Finansial — Pencairan payout instructor yang SUDAH disetujui Direktur.
 * `disetujui` → `finish` (disbursed_at diisi). Sama seperti `disburseCommission` (marketing):
 * Direktur/admin_ops boleh mengeksekusi pencairan (pemisahan assignment from approval sudah terjadi
 * di langkah `approve`).
 */
export async function payPayout(actor: AuthContext, id: string) {
  if (!isAdminLike(actor)) {
    throw AppError.forbidden('Only a Director or Operations Admin can release a payout', 'payout.release_requires_director');
  }
  return withTransaction(async (tx) => {
    const payout = await repo.getPayoutForUpdate(tx, id);
    if (!payout) throw AppError.notFound('Payout not found', 'payout.not_found');
    if (payout.status !== 'approved') {
      throw AppError.conflict(`Payout is in status '${payout.status}'; it must be 'approved' before it can be paid out`, 'payout.not_approved');
    }
    await repo.markPayoutPaid(tx, id);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'payout',
        action: 'pay',
        entity: 'instructor_payouts',
        entityId: id,
        before: { status: payout.status },
        after: { status: 'completed' },
      },
      tx,
    );
    return repo.getPayout(id, tx);
  });
}

// ── reviews ──────────────────────────────────────────────────────────────

export async function listCourseReviews(courseId: string, p: PageParams) {
  return repo.listReviewsByCourse(courseId, p);
}

export async function createReview(actor: AuthContext, courseId: string, input: CreateReviewInput) {
  const enrollment = await repo.getEnrollmentForReview(input.enrollment_id);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  if (enrollment.user_id !== actor.userId) {
    throw AppError.forbidden('Only the enrolled student can write this review', 'review.requires_enrollment_owner');
  }
  if (enrollment.course_id !== courseId) {
    throw AppError.badRequest('That enrolment belongs to a different course', 'enrollment.course_mismatch');
  }
  if (!['active', 'completed'].includes(enrollment.status)) {
    throw AppError.badRequest('You can only review a course you are actively taking or have completed', 'review.enrollment_not_active');
  }
  const existing = await repo.getReviewByEnrollment(input.enrollment_id);
  if (existing) throw AppError.conflict('You have already reviewed this course', 'review.already_exists');

  const { id } = await repo.insertReview({
    enrollment_id: input.enrollment_id,
    user_id: actor.userId,
    course_id: courseId,
    rating: input.rating,
    review: input.review ?? null,
  });
  return { id };
}
