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
const isSiswa = (actor: AuthContext) => actor.roles.includes('student') && !isSuper(actor);
const isInstructorScoped = (actor: AuthContext) =>
  !isSuper(actor) && actor.roles.includes('instructor') && !actor.roles.some((r) => ['operations_admin', 'director', 'chairperson', 'supervisor'].includes(r));

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

/** Enroll (beli/assign/bundle/path) — dipanggil admin/instructor untuk assign manual, atau internal untuk source lain. */
export async function create(actor: AuthContext, input: CreateEnrollmentInput) {
  const existing = await repo.findActiveByUserCourse(input.user_id, input.course_id);
  if (existing) throw AppError.conflict('This user is already actively enrolled in this course', 'enrollment.already_active');

  const { id } = await repo.insert({
    user_id: input.user_id,
    course_id: input.course_id,
    cohort_id: input.cohort_id ?? null,
    source: input.source,
    order_item_id: input.order_item_id ?? null,
    assigned_by: input.source === 'assign' ? actor.userId : null,
    akses_kedaluwarsa_at: input.akses_kedaluwarsa_at ?? null,
    notes: input.notes ?? null,
  });

  await recordAudit({
    userId: actor.userId,
    module: 'enrollment',
    action: 'create',
    entity: 'enrollments',
    entityId: id,
    after: { user_id: input.user_id, course_id: input.course_id, source: input.source },
    reason: input.notes ?? null,
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
      if (cohort.max_quota !== null && activeCount >= cohort.max_quota) {
        throw AppError.conflict('The destination cohort is full', 'cohort.target_full');
      }
      await repo.setCohort(id, input.cohort_id as string);
      const member = await repo.findCohortMember(cohort.id, e.user_id, tx);
      if (!member) await repo.insertCohortMember({ cohort_id: cohort.id, user_id: e.user_id, status: 'active', waitlist_sort_orderan: null }, tx);
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
    reason: input.notes ?? null,
  });
  return repo.detail(id);
}

export async function revoke(actor: AuthContext, id: string, input: RevokeEnrollmentInput) {
  const e = await detail(actor, id);
  if (e.status === 'cancelled') throw AppError.badRequest('This enrolment has been cancelled', 'enrollment.cancelled');
  await repo.updateStatus(id, 'cancelled', { notes: input.reason });
  await recordAudit({
    userId: actor.userId,
    module: 'enrollment',
    action: 'revoke',
    entity: 'enrollments',
    entityId: id,
    before: { status: e.status },
    after: { status: 'cancelled' },
    reason: input.reason,
  });
  return repo.detail(id);
}

const isStaff = (actor: AuthContext) =>
  isSuper(actor) || actor.roles.some((r) => ['operations_admin', 'director', 'chairperson', 'supervisor'].includes(r));

/**
 * Ulang course from awal (reset progres).
 *
 * Student hanya bisa mengulang enrollment miliknya, dan hanya bila course itu
 * mengizinkan (`courses.allow_restart`, diatur per course di Admin Panel).
 * Admin selalu bisa mereset progres student mana pun.
 *
 * Percobaan exam no dikembalikan: kalau iya, mengulang course menjadi cara
 * melewati batas percobaan exam. Certificate yang sudah publish tetap valid.
 */
export async function restart(actor: AuthContext, id: string) {
  const e = await repo.detail(id);
  if (!e) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  const staff = isStaff(actor);
  if (!staff) {
    if (e.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
    if (!(await repo.courseAllowsRestart(e.course_id))) {
      throw AppError.forbidden('Restarting this course is not allowed', 'enrollment.restart_not_allowed');
    }
  }
  if (!['registered', 'active', 'completed'].includes(e.status)) {
    throw AppError.conflict('Only an active or completed enrolment can be restarted', 'enrollment.restart_invalid_status');
  }

  await withTransaction(async (tx) => {
    await repo.resetProgress(id, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'enrollment',
        action: 'restart',
        entity: 'enrollments',
        entityId: id,
        before: { status: e.status },
        after: { status: 'active', progress: 0, by_staff: staff && e.user_id !== actor.userId },
      },
      tx,
    );
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
        source: 'assign',
        order_item_id: null,
        assigned_by: actor.userId,
        akses_kedaluwarsa_at: null,
        notes: input.reason ?? null,
      });
      hasil.push({ user_id: userId, ok: true });
      await recordAudit({
        userId: actor.userId,
        module: 'enrollment',
        action: 'bulk_import',
        entity: 'enrollments',
        entityId: id,
        after: { course_id: input.course_id, user_id: userId },
        reason: input.reason ?? null,
      });
    } catch (err) {
      hasil.push({ user_id: userId, ok: false, error: (err as Error).message });
    }
  }
  return {
    total: input.user_ids.length,
    success: hasil.filter((h) => h.ok).length,
    failed: hasil.filter((h) => !h.ok).length,
    details: hasil,
  };
}

// ── Cohorts ─────────────────────────────────────────────

export async function listCohorts(_actor: AuthContext, courseId: string) {
  return repo.listCohorts(courseId);
}

export async function createCohort(actor: AuthContext, courseId: string, input: CreateCohortInput) {
  const { id } = await repo.insertCohort({
    course_id: courseId,
    name: input.name,
    start_date: input.start_date,
    end_date: input.end_date ?? null,
    max_quota: input.max_quota ?? null,
  });
  await recordAudit({ userId: actor.userId, module: 'cohort', action: 'create', entity: 'cohorts', entityId: id, after: input });
  return repo.cohortDetail(id);
}

export async function updateCohort(actor: AuthContext, id: string, input: UpdateCohortInput) {
  const before = await repo.cohortDetail(id);
  if (!before) throw AppError.notFound('Cohort not found', 'cohort.not_found');
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.start_date !== undefined) fields.start_date = input.start_date;
  if (input.end_date !== undefined) fields.end_date = input.end_date;
  if (input.max_quota !== undefined) fields.max_quota = input.max_quota;
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

/** Semua cohort lintas course (untuk halaman admin/manajemen cohort). */
export async function listAllCohorts(p: PageParams) {
  return repo.listAllCohorts(p);
}

export async function listCohortWaitlist(cohortId: string) {
  const cohort = await repo.cohortDetail(cohortId);
  if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
  return repo.listCohortWaitlist(cohortId);
}

/** Promosikan satu anggota waitlist → active; hormati kapasitas cohort bila terisi penuh. */
export async function promoteWaitlistMember(actor: AuthContext, cohortId: string, memberId: string) {
  return withTransaction(async (tx) => {
    const cohort = await repo.lockCohort(cohortId, tx);
    if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
    const member = await repo.getCohortMemberById(memberId, tx);
    if (!member || member.cohort_id !== cohortId) throw AppError.notFound('Waiting list member not found', 'cohort.waitlist_member_not_found');
    if (member.status !== 'waitlist') throw AppError.conflict('This member is not on the waiting list', 'cohort.member_not_waitlisted');

    const activeCount = await repo.countActiveCohortMembers(cohortId, tx);
    if (cohort.max_quota !== null && activeCount >= cohort.max_quota) {
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
        after: { status: 'active' },
      },
      tx,
    );
    return repo.getCohortMemberById(memberId, tx);
  });
}

/** Student mendaftar cohort: active bila ada slot, else login waitlist FIFO. */
export async function joinCohort(actor: AuthContext, cohortId: string) {
  return withTransaction(async (tx) => {
    const cohort = await repo.lockCohort(cohortId, tx);
    if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
    if (cohort.status === 'cancelled' || cohort.status === 'completed') {
      throw AppError.conflict('This cohort is not accepting new enrolments', 'cohort.closed');
    }
    const existing = await repo.findCohortMember(cohortId, actor.userId, tx);
    if (existing && existing.status !== 'left') throw AppError.conflict('You are already a member of this cohort', 'cohort.already_member');

    const activeCount = await repo.countActiveCohortMembers(cohortId, tx);
    const isFull = cohort.max_quota !== null && activeCount >= cohort.max_quota;
    if (isFull) {
      const posisi = await repo.nextWaitlistPosition(cohortId, tx);
      const { id } = await repo.insertCohortMember({ cohort_id: cohortId, user_id: actor.userId, status: 'waitlist', waitlist_sort_orderan: posisi }, tx);
      await recordAudit({ userId: actor.userId, module: 'cohort', action: 'join_waitlist', entity: 'cohort_members', entityId: id }, tx);
      return { status: 'waitlist' as const, waitlist_sort_orderan: posisi };
    }
    const { id } = await repo.insertCohortMember({ cohort_id: cohortId, user_id: actor.userId, status: 'active', waitlist_sort_orderan: null }, tx);
    await repo.findActiveByUserCourse(actor.userId, cohort.course_id).then(async (e) => {
      if (e && !e.cohort_id) await repo.setCohort(e.id, cohortId); // tempel enrollment to cohort bila belum tertaut
    });
    await recordAudit({ userId: actor.userId, module: 'cohort', action: 'join_aktif', entity: 'cohort_members', entityId: id }, tx);
    return { status: 'active' as const, waitlist_sort_orderan: null };
  });
}

/** Buka slot tambahan (kapasitas naik) → promosikan waitlist FIFO. idempoten terhadap panggilan ganda. */
export async function openSlot(actor: AuthContext, cohortId: string, input: OpenSlotInput) {
  return withTransaction(async (tx) => {
    const cohort = await repo.lockCohort(cohortId, tx);
    if (!cohort) throw AppError.notFound('Cohort not found', 'cohort.not_found');
    const kuotaBaru = cohort.max_quota === null ? null : cohort.max_quota + input.tambahan_slot;
    if (kuotaBaru !== null) await repo.updateCohort(cohortId, { max_quota: kuotaBaru });

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
    return { max_quota: kuotaBaru, dipromosikan: promoted.length };
  });
}
