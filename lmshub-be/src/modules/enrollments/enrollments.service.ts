import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { withTransaction } from '../../core/db/withTransaction';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import * as repo from './enrollments.repository';
import {
  BulkImportInput,
  CreateCohortInput,
  CreateEnrollmentInput,
  OpenSlotInput,
  RevokeEnrollmentInput,
  TransferEnrollmentInput,
  UpdateCohortInput,
} from './enrollments.validation';

const isSuper = (actor: AuthContext) => actor.roles.includes('super_admin');
const isSiswa = (actor: AuthContext) => actor.roles.includes('siswa') && !isSuper(actor);
const isInstructorScoped = (actor: AuthContext) =>
  !isSuper(actor) && actor.roles.includes('instruktur') && !actor.roles.some((r) => ['admin_ops', 'direktur', 'ketua', 'pembina'].includes(r));

export async function list(actor: AuthContext, p: PageParams, filters: repo.EnrollmentFilters) {
  const f: repo.EnrollmentFilters = { ...filters };
  if (isSiswa(actor)) f.ownerUserId = actor.userId;
  else if (isInstructorScoped(actor)) f.instructorUserId = actor.userId;
  return repo.list(p, f);
}

export async function detail(actor: AuthContext, id: string) {
  const e = await repo.detail(id);
  if (!e) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  if (isSiswa(actor) && e.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return e;
}

/** Enroll (beli/assign/bundle/path) — dipanggil admin/instruktur untuk assign manual, atau internal untuk sumber lain. */
export async function create(actor: AuthContext, input: CreateEnrollmentInput) {
  const existing = await repo.findActiveByUserCourse(input.user_id, input.course_id);
  if (existing) throw AppError.conflict('This user is already actively enrolled in this course', 'enrollment.already_active');

  const { id } = await repo.insert({
    user_id: input.user_id,
    course_id: input.course_id,
    cohort_id: input.cohort_id ?? null,
    sumber: input.sumber,
    order_item_id: input.order_item_id ?? null,
    assigned_by: input.sumber === 'assign' ? actor.userId : null,
    akses_kedaluwarsa_at: input.akses_kedaluwarsa_at ?? null,
    catatan: input.catatan ?? null,
  });

  await recordAudit({
    userId: actor.userId,
    module: 'enrollment',
    action: 'create',
    entity: 'enrollments',
    entityId: id,
    after: { user_id: input.user_id, course_id: input.course_id, sumber: input.sumber },
    reason: input.catatan ?? null,
  });
  return repo.detail(id);
}

export async function transfer(actor: AuthContext, id: string, input: TransferEnrollmentInput) {
  const e = await detail(actor, id);
  if (input.cohort_id) {
    await withTransaction(async (tx) => {
      const cohort = await repo.lockCohort(input.cohort_id as string, tx);
      if (!cohort) throw AppError.notFound('Destination cohort not found', 'cohort.target_not_found');
      const activeCount = await repo.countActiveCohortMembers(cohort.id, tx);
      if (cohort.kuota_maksimal !== null && activeCount >= cohort.kuota_maksimal) {
        throw AppError.conflict('The destination cohort is full', 'cohort.target_full');
      }
      await repo.setCohort(id, input.cohort_id as string);
      const member = await repo.findCohortMember(cohort.id, e.user_id, tx);
      if (!member) await repo.insertCohortMember({ cohort_id: cohort.id, user_id: e.user_id, status: 'aktif', waitlist_urutan: null }, tx);
    });
  } else {
    await repo.setCohort(id, null);
  }
  await recordAudit({
    userId: actor.userId,
    module: 'enrollment',
    action: 'transfer',
    entity: 'enrollments',
    entityId: id,
    before: { cohort_id: e.cohort_id },
    after: { cohort_id: input.cohort_id ?? null },
    reason: input.catatan ?? null,
  });
  return repo.detail(id);
}

export async function revoke(actor: AuthContext, id: string, input: RevokeEnrollmentInput) {
  const e = await detail(actor, id);
  if (e.status === 'batal') throw AppError.badRequest('This enrolment has been cancelled', 'enrollment.cancelled');
  await repo.updateStatus(id, 'batal', { catatan: input.alasan });
  await recordAudit({
    userId: actor.userId,
    module: 'enrollment',
    action: 'revoke',
    entity: 'enrollments',
    entityId: id,
    before: { status: e.status },
    after: { status: 'batal' },
    reason: input.alasan,
  });
  return repo.detail(id);
}

export async function bulkImport(actor: AuthContext, input: BulkImportInput) {
  const hasil: Array<{ user_id: string; ok: boolean; error?: string }> = [];
  for (const userId of input.user_ids) {
    try {
      const existing = await repo.findActiveByUserCourse(userId, input.course_id);
      if (existing) throw new Error('Already actively enrolled');
      const { id } = await repo.insert({
        user_id: userId,
        course_id: input.course_id,
        cohort_id: input.cohort_id ?? null,
        sumber: 'assign',
        order_item_id: null,
        assigned_by: actor.userId,
        akses_kedaluwarsa_at: null,
        catatan: input.alasan ?? null,
      });
      hasil.push({ user_id: userId, ok: true });
      await recordAudit({
        userId: actor.userId,
        module: 'enrollment',
        action: 'bulk_import',
        entity: 'enrollments',
        entityId: id,
        after: { course_id: input.course_id, user_id: userId },
        reason: input.alasan ?? null,
      });
    } catch (err) {
      hasil.push({ user_id: userId, ok: false, error: (err as Error).message });
    }
  }
  return {
    total: input.user_ids.length,
    berhasil: hasil.filter((h) => h.ok).length,
    gagal: hasil.filter((h) => !h.ok).length,
    rincian: hasil,
  };
}

// ── Cohorts ─────────────────────────────────────────────

export async function listCohorts(_actor: AuthContext, courseId: string) {
  return repo.listCohorts(courseId);
}

export async function createCohort(actor: AuthContext, courseId: string, input: CreateCohortInput) {
  const { id } = await repo.insertCohort({
    course_id: courseId,
    nama: input.nama,
    tanggal_mulai: input.tanggal_mulai,
    tanggal_selesai: input.tanggal_selesai ?? null,
    kuota_maksimal: input.kuota_maksimal ?? null,
  });
  await recordAudit({ userId: actor.userId, module: 'cohort', action: 'create', entity: 'cohorts', entityId: id, after: input });
  return repo.cohortDetail(id);
}

export async function updateCohort(actor: AuthContext, id: string, input: UpdateCohortInput) {
  const before = await repo.cohortDetail(id);
  if (!before) throw AppError.notFound('Cohort not found', 'cohort.not_found');
  const fields: Record<string, unknown> = {};
  if (input.nama !== undefined) fields.nama = input.nama;
  if (input.tanggal_mulai !== undefined) fields.tanggal_mulai = input.tanggal_mulai;
  if (input.tanggal_selesai !== undefined) fields.tanggal_selesai = input.tanggal_selesai;
  if (input.kuota_maksimal !== undefined) fields.kuota_maksimal = input.kuota_maksimal;
  if (input.status !== undefined) fields.status = input.status;
  await repo.updateCohort(id, fields);
  await recordAudit({ userId: actor.userId, module: 'cohort', action: 'update', entity: 'cohorts', entityId: id, before, after: input });
  return repo.cohortDetail(id);
}

export async function listCohortMembers(_actor: AuthContext, cohortId: string) {
  const cohort = await repo.cohortDetail(cohortId);
  if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
  return repo.listCohortMembers(cohortId);
}

/** Semua cohort lintas kursus (untuk halaman admin/manajemen cohort). */
export async function listAllCohorts(p: PageParams) {
  return repo.listAllCohorts(p);
}

export async function listCohortWaitlist(cohortId: string) {
  const cohort = await repo.cohortDetail(cohortId);
  if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
  return repo.listCohortWaitlist(cohortId);
}

/** Promosikan satu anggota waitlist → aktif; hormati kapasitas cohort bila terisi penuh. */
export async function promoteWaitlistMember(actor: AuthContext, cohortId: string, memberId: string) {
  return withTransaction(async (tx) => {
    const cohort = await repo.lockCohort(cohortId, tx);
    if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
    const member = await repo.getCohortMemberById(memberId, tx);
    if (!member || member.cohort_id !== cohortId) throw AppError.notFound('Waiting list member not found', 'cohort.waitlist_member_not_found');
    if (member.status !== 'waitlist') throw AppError.conflict('This member is not on the waiting list', 'cohort.member_not_waitlisted');

    const activeCount = await repo.countActiveCohortMembers(cohortId, tx);
    if (cohort.kuota_maksimal !== null && activeCount >= cohort.kuota_maksimal) {
      throw AppError.conflict('This cohort is full, so no one can be promoted from the waiting list', 'cohort.full_cannot_promote');
    }

    await repo.promoteCohortMember(memberId, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'cohort',
        action: 'promote_waitlist',
        entity: 'cohort_members',
        entityId: memberId,
        before: { status: 'waitlist' },
        after: { status: 'aktif' },
      },
      tx,
    );
    return repo.getCohortMemberById(memberId, tx);
  });
}

/** Siswa mendaftar cohort: aktif bila ada slot, else masuk waitlist FIFO. */
export async function joinCohort(actor: AuthContext, cohortId: string) {
  return withTransaction(async (tx) => {
    const cohort = await repo.lockCohort(cohortId, tx);
    if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
    if (cohort.status === 'dibatalkan' || cohort.status === 'selesai') {
      throw AppError.conflict('This cohort is not accepting new enrolments', 'cohort.closed');
    }
    const existing = await repo.findCohortMember(cohortId, actor.userId, tx);
    if (existing && existing.status !== 'keluar') throw AppError.conflict('You are already a member of this cohort', 'cohort.already_member');

    const activeCount = await repo.countActiveCohortMembers(cohortId, tx);
    const isFull = cohort.kuota_maksimal !== null && activeCount >= cohort.kuota_maksimal;
    if (isFull) {
      const posisi = await repo.nextWaitlistPosition(cohortId, tx);
      const { id } = await repo.insertCohortMember({ cohort_id: cohortId, user_id: actor.userId, status: 'waitlist', waitlist_urutan: posisi }, tx);
      await recordAudit({ userId: actor.userId, module: 'cohort', action: 'join_waitlist', entity: 'cohort_members', entityId: id }, tx);
      return { status: 'waitlist' as const, waitlist_urutan: posisi };
    }
    const { id } = await repo.insertCohortMember({ cohort_id: cohortId, user_id: actor.userId, status: 'aktif', waitlist_urutan: null }, tx);
    await repo.findActiveByUserCourse(actor.userId, cohort.course_id).then(async (e) => {
      if (e && !e.cohort_id) await repo.setCohort(e.id, cohortId); // tempel enrollment ke cohort bila belum tertaut
    });
    await recordAudit({ userId: actor.userId, module: 'cohort', action: 'join_aktif', entity: 'cohort_members', entityId: id }, tx);
    return { status: 'aktif' as const, waitlist_urutan: null };
  });
}

/** Buka slot tambahan (kapasitas naik) → promosikan waitlist FIFO. idempoten terhadap panggilan ganda. */
export async function openSlot(actor: AuthContext, cohortId: string, input: OpenSlotInput) {
  return withTransaction(async (tx) => {
    const cohort = await repo.lockCohort(cohortId, tx);
    if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
    const kuotaBaru = cohort.kuota_maksimal === null ? null : cohort.kuota_maksimal + input.tambahan_slot;
    if (kuotaBaru !== null) await repo.updateCohort(cohortId, { kuota_maksimal: kuotaBaru });

    const activeCount = await repo.countActiveCohortMembers(cohortId, tx);
    const slotTersedia = kuotaBaru === null ? input.tambahan_slot : Math.max(0, kuotaBaru - activeCount);
    const promoted = await repo.topWaitlisted(cohortId, slotTersedia, tx);
    for (const m of promoted) {
      await repo.promoteCohortMember(m.id, tx);
      await recordAudit(
        { userId: actor.userId, module: 'cohort', action: 'promote_waitlist', entity: 'cohort_members', entityId: m.id },
        tx,
      );
    }
    return { kuota_maksimal: kuotaBaru, dipromosikan: promoted.length };
  });
}
