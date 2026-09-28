import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { withTransaction } from '../../core/db/withTransaction';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './reports.repository';
import { ApprovePayoutInput, CreateFinancialEntryInput, CreateReviewInput } from './reports.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isDirektur = (actor: AuthContext) => actor.roles.includes('direktur') || isSuper(actor);
const isAdminLike = (actor: AuthContext) => isDirektur(actor) || actor.roles.includes('admin_ops');

// ── financial_entries ────────────────────────────────────────────────────

export async function listFinancialEntries(p: PageParams, f: repo.FinancialEntryFilters) {
  return repo.listFinancialEntries(p, f);
}

export async function createFinancialEntry(actor: AuthContext, input: CreateFinancialEntryInput) {
  const kategori = await repo.getKategoriBiaya(input.kategori_id);
  if (!kategori) throw AppError.badRequest('Expense category not found', 'finance.category_not_found');
  if (kategori.jenis !== input.jenis) {
    throw AppError.badRequest('The entry type does not match the selected category', 'finance.entry_type_mismatch');
  }
  const tgl = new Date(input.tanggal);
  const { id } = await repo.insertFinancialEntry({
    jenis: input.jenis,
    kategori_id: input.kategori_id,
    course_id: input.course_id ?? null,
    nominal: input.nominal,
    bukti: input.bukti ?? null,
    tanggal: input.tanggal,
    periode_bulan: tgl.getUTCMonth() + 1,
    periode_tahun: tgl.getUTCFullYear(),
    deskripsi: input.deskripsi ?? null,
    dicatat_oleh: actor.userId,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'keuangan',
    action: 'create_financial_entry',
    entity: 'financial_entries',
    entityId: id,
    after: input,
  });
  return { id };
}

// ── laporan arus kas & laba ───────────────────────────────────────────────

export async function cashflow(f: { dari?: string; sampai?: string }) {
  const rows = await repo.cashflowByPeriod(f);
  return rows.map((r) => ({
    periode: `${r.periode_tahun}-${String(r.periode_bulan).padStart(2, '0')}`,
    pemasukan: Number(r.pemasukan),
    pengeluaran: Number(r.pengeluaran),
    laba: Number(r.pemasukan) - Number(r.pengeluaran),
  }));
}

/** Stub ekspor: mengembalikan JSON data laporan (rendering PDF/Excel di luar cakupan). */
export async function exportReport(f: { dari?: string; sampai?: string }) {
  const data = await cashflow(f);
  return {
    format: 'json' as const,
    catatan: 'PDF/Excel export is not implemented yet; returning raw data.',
    generated_at: new Date().toISOString(),
    data,
  };
}

// ── instructor_payouts ───────────────────────────────────────────────────

export async function listPayouts(actor: AuthContext, p: PageParams, status?: string) {
  const seesAll = isDirektur(actor) || actor.roles.includes('ketua') || actor.roles.includes('pembina');
  // Instruktur: scope ke instructor_profiles.id miliknya (bukan user id — kolom instructor_id
  // di instructor_payouts mereferensikan instructor_profiles.id).
  const instructorId = seesAll ? undefined : (await repo.instructorProfileIdByUser(actor.userId)) ?? '__none__';
  const [daftar, totalPending] = await Promise.all([
    repo.listPayouts(p, { status, instructorId }),
    // Sengaja tidak ikut filter status: kartu KPI menampilkan total antrean
    // persetujuan, apa pun filter yang sedang dipilih pengguna.
    repo.sumPendingPayouts({ instructorId }),
  ]);
  return { ...daftar, totalPending };
}

/** Saldo revenue share instruktur yang tersedia untuk dicairkan. */
export async function availablePayout(actor: AuthContext) {
  const ipId = await repo.instructorProfileIdByUser(actor.userId);
  if (!ipId) return { nominal_tersedia: 0, jumlah_item: 0 };
  const { nominal, jumlah } = await repo.availableSharesByInstructor(ipId);
  return { nominal_tersedia: nominal, jumlah_item: jumlah };
}

/** Instruktur mengajukan pencairan seluruh saldo tersedia → payout status 'menunggu_approval'. */
export async function requestPayout(actor: AuthContext) {
  const ipId = await repo.instructorProfileIdByUser(actor.userId);
  if (!ipId) throw AppError.forbidden('Only an instructor can request a payout', 'payout.request_requires_instructor');
  const now = new Date();
  const periode = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  try {
    const payout = await withTransaction((tx) => repo.createPayoutFromShares(tx, ipId, actor.userId, periode));
    await recordAudit({
      userId: actor.userId,
      module: 'payout',
      action: 'ajukan',
      entity: 'instructor_payouts',
      entityId: payout.id,
      after: { total_nominal: payout.total_nominal, status: payout.status },
    });
    return payout;
  } catch (e) {
    if (e instanceof Error && e.message === 'NO_BALANCE') {
      throw AppError.badRequest('There is nothing available to withdraw right now', 'payout.nothing_to_withdraw');
    }
    throw e;
  }
}

/** Approval payout instruktur — HANYA Direktur (atau super_admin). Transaksi + row-lock cegah approve ganda. */
export async function approvePayout(actor: AuthContext, id: string, input: ApprovePayoutInput) {
  if (!isDirektur(actor)) {
    throw AppError.forbidden('Only a Director can approve a payout', 'payout.approve_requires_director');
  }
  return withTransaction(async (tx) => {
    const payout = await repo.getPayoutForUpdate(tx, id);
    if (!payout) throw AppError.notFound('Payout not found', 'payout.not_found');
    if (payout.status !== 'menunggu_approval' && payout.status !== 'dihitung') {
      throw AppError.conflict(`Payout is in status '${payout.status}' and cannot be processed again`, 'payout.not_reprocessable');
    }
    const newStatus = input.aksi === 'approve' ? 'disetujui' : 'ditolak';
    await repo.setPayoutStatus(tx, id, newStatus, actor.userId, input.catatan_approval ?? null);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'payout',
        action: `approve_${input.aksi}`,
        entity: 'instructor_payouts',
        entityId: id,
        before: { status: payout.status },
        after: { status: newStatus },
        reason: input.catatan_approval ?? null,
      },
      tx,
    );
    return repo.getPayout(id, tx);
  });
}

/**
 * Finansial — Pencairan payout instruktur yang SUDAH disetujui Direktur.
 * `disetujui` → `selesai` (dicairkan_at diisi). Sama seperti `disburseCommission` (marketing):
 * Direktur/admin_ops boleh mengeksekusi pencairan (pemisahan tugas dari approval sudah terjadi
 * di langkah `approve`).
 */
export async function payPayout(actor: AuthContext, id: string) {
  if (!isAdminLike(actor)) {
    throw AppError.forbidden('Only a Director or Operations Admin can release a payout', 'payout.release_requires_director');
  }
  return withTransaction(async (tx) => {
    const payout = await repo.getPayoutForUpdate(tx, id);
    if (!payout) throw AppError.notFound('Payout not found', 'payout.not_found');
    if (payout.status !== 'disetujui') {
      throw AppError.conflict(`Payout is in status '${payout.status}'; it must be 'disetujui' before it can be paid out`, 'payout.not_approved');
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
        after: { status: 'selesai' },
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
  if (!['aktif', 'selesai'].includes(enrollment.status)) {
    throw AppError.badRequest('You can only review a course you are actively taking or have completed', 'review.enrollment_not_active');
  }
  const existing = await repo.getReviewByEnrollment(input.enrollment_id);
  if (existing) throw AppError.conflict('You have already reviewed this course', 'review.already_exists');

  const { id } = await repo.insertReview({
    enrollment_id: input.enrollment_id,
    user_id: actor.userId,
    course_id: courseId,
    rating: input.rating,
    ulasan: input.ulasan ?? null,
  });
  return { id };
}
