import { nanoid, customAlphabet } from 'nanoid';
import QRCode from 'qrcode';
import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { withTransaction } from '../../core/db/withTransaction';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import { env } from '../../core/config/env';
import { getSetting, getSettingInt } from '../../core/settings/settings';
import * as repo from './certificates.repository';
import { DEFAULT_PASSING_SCORE, evaluasiUjianAkhir } from './completion-rules';
import {
  CreateTemplateInput,
  UpdateTemplateInput,
  ExceptionIssueInput,
  RevokeInput,
  ReissueInput,
  CreateBadgeInput,
  AwardBadgeInput,
  AwardPointsInput,
  LeaderboardSnapshotInput,
} from './certificates.validation';

const isSuper = (actor: AuthContext) => actor.permissions.has('*');
const isDirektur = (actor: AuthContext) => isSuper(actor) || actor.roles.includes('director');

// Certificate number: prefix + year + 10 random alphanumeric uppercase characters — never reused.
const nomorAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);
const MAX_GENERATE_RETRY = 5;
const GRADUATION_MIN_PERSEN_SELESAI = 100; // bawaan setting `certificate.syarat_progres_min_persen`

async function generateUniqueNomor(): Promise<string> {
  for (let i = 0; i < MAX_GENERATE_RETRY; i++) {
    const number = `LMS-${new Date().getFullYear()}-${nomorAlphabet()}`;
    const existing = await repo.getByNomor(number);
    if (!existing) return number;
  }
  throw AppError.internal('Could not generate a unique certificate number, please try again', 'certificate.number_generation_failed');
}

/**
 * Public verification page for a certificate number. Certificates issued before
 * the English URLs carry `/certificate/…` in their QR code; the frontend
 * redirects those here, so both keep verifying.
 */
export function verifyUrl(number: string): string {
  return `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/certificates/${number}`;
}

/** Build issuance fields: unique number, verification code, & QR (data URI PNG) containing verification URL. */
async function buildIssueFields(): Promise<{ certificate_number: string; verification_code: string; qr_code_url: string }> {
  const number = await generateUniqueNomor();
  const kode = nanoid(32);
  const qr = await QRCode.toDataURL(verifyUrl(number), { margin: 1, width: 240 });
  return { certificate_number: number, verification_code: kode, qr_code_url: qr };
}

// ── Certificates ──────────────────────────────────────────

export async function list(actor: AuthContext, p: PageParams, filters: { user_id?: string; course_id?: string; status?: string }) {
  const isStaff = isSuper(actor) || actor.permissions.has('certificate.update');
  const scoped = isStaff ? filters : { ...filters, user_id: actor.userId };
  return repo.list(p, scoped);
}

export async function detail(actor: AuthContext, id: string) {
  const cert = await repo.detail(id);
  if (!cert) throw AppError.notFound('Certificate not found', 'certificate.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('certificate.update');
  if (!isStaff && cert.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return cert;
}

/** Syarat progres minimum (persen); setting settings → Certificate, bawaan 100. */
async function minPersenSelesai(): Promise<number> {
  const n = await getSettingInt('certificate.syarat_progres_min_persen', GRADUATION_MIN_PERSEN_SELESAI);
  return Math.min(100, Math.max(0, n));
}

/**
 * Evaluate graduation requirements: lesson progress + final exam (if course has one).
 *
 * - Minimum progress read from setting `certificate.syarat_progres_min_persen`
 *   (default 100 — same as previous behavior).
 * - Final exam pointed per course (`courses.final_exam_quiz_id`). Passed if
 *   best graded attempt >= quiz passing value (or setting
 *   `certificate.syarat_passing_score_min` if quiz doesn't fill it).
 * - Course without final exam: only progress, exactly like previous.
 *
 * Published certificates are never re-evaluated. Pending ones
 * always follow latest evaluation results — including dropping back to "not
 * eligible" if admin adds a final exam later.
 */
export async function evaluate(actor: AuthContext, enrollmentId: string) {
  const enrollment = await repo.getEnrollment(enrollmentId);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('certificate.update');
  if (!isStaff && enrollment.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');

  const [progress, minPersen, quiz, settingPassing] = await Promise.all([
    repo.getCourseProgress(enrollmentId),
    minPersenSelesai(),
    repo.getFinalExam(enrollment.course_id),
    getSetting('certificate.syarat_passing_score_min', ''),
  ]);
  const persenSelesai = Number(progress?.progress_percent ?? 0);
  const exam = evaluasiUjianAkhir({
    quiz,
    scoreTerbaik: quiz ? await repo.bestGradedScore(enrollmentId, quiz.id) : null,
    settingPassing,
  });
  const progresCukup = persenSelesai >= minPersen;
  const memenuhiSyarat = progresCukup && exam.lulus;
  const snapshot = {
    progress_percent: persenSelesai,
    min_persen_finish: minPersen,
    final_exam: exam.ada
      ? {
          quiz_id: exam.quiz_id,
          title: exam.title,
          passing_score_val: exam.passing_score_val,
          score_terbaik_persen: exam.score_terbaik_persen,
          lulus: exam.lulus,
        }
      : null,
    dievaluasi_at: new Date().toISOString(),
  };
  const status = memenuhiSyarat ? 'eligible' : 'not_eligible';

  let cert = await repo.findActiveByEnrollment(enrollmentId);
  if (!cert) {
    cert = await repo.insertPending({
      user_id: enrollment.user_id,
      course_id: enrollment.course_id,
      enrollment_id: enrollmentId,
      template_id: null,
      status,
      criteria_snapshot: snapshot,
    });
  } else if (cert.status !== 'publish') {
    // Exception certificate (Director channel) cannot be downgraded by regular evaluation.
    const pengecualian = (cert.criteria_snapshot as { pengecualian?: boolean } | null)?.pengecualian === true;
    if (!pengecualian) {
      await repo.updateStatus(cert.id, status, snapshot);
      cert = await repo.detail(cert.id);
    }
  }
  return cert;
}

/** Alasan klaim ditolak, dalam kalimat yang bisa langsung ditampilkan. */
function alasanBelumLulus(snapshot: unknown): { message: string; key: string; details: unknown } {
  const s = (snapshot ?? {}) as {
    progress_percent?: number;
    min_persen_finish?: number;
    final_exam?: { title?: string; passing_score_val?: number; score_terbaik_persen?: number | null; lulus?: boolean } | null;
  };
  const persen = s.progress_percent ?? 0;
  const min = s.min_persen_finish ?? GRADUATION_MIN_PERSEN_SELESAI;
  if (persen < min) {
    return {
      message: `Graduation requirements not met (progress ${persen}% of ${min}%)`,
      key: 'certificate.requirements_not_met',
      details: s,
    };
  }
  const u = s.final_exam;
  return {
    message:
      u?.score_terbaik_persen === null || u?.score_terbaik_persen === undefined
        ? `Pass the final exam "${u?.title ?? ''}" (minimum ${u?.passing_score_val ?? DEFAULT_PASSING_SCORE}%) to unlock your certificate`
        : `Your best final exam score is ${u.score_terbaik_persen}% — ${u.passing_score_val}% is required to unlock your certificate`,
    key: 'certificate.final_exam_not_passed',
    details: s,
  };
}

/** Certificate issuance: unique number + verification code, wrapped in DB transaction. */
export async function issue(actor: AuthContext, certificateId: string) {
  if (!isSuper(actor) && !actor.permissions.has('certificate.update')) {
    throw AppError.forbidden('You need the certificate.update permission', 'permission.certificate_update_required');
  }
  return withTransaction(async (tx) => {
    const cert = await repo.lockForUpdate(certificateId, tx);
    if (!cert) throw AppError.notFound('Certificate not found', 'certificate.not_found');
    if (cert.status !== 'eligible') {
      throw AppError.conflict('A certificate can only be issued once the student is eligible', 'certificate.not_eligible');
    }
    const fields = await buildIssueFields();
    const issued = await repo.issue(certificateId, { ...fields, pdf_url: null, issued_by: actor.userId }, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'issue',
        entity: 'certificates',
        entityId: certificateId,
        before: { status: cert.status },
        after: { status: 'publish', certificate_number: fields.certificate_number },
      },
      tx,
    );
    return issued;
  });
}

/**
 * Self-service student: evaluate own enrollment, then issue certificate if eligible.
 * Does not require `certificate.update` permission — just enrollment owner. System as issuer.
 */
export async function claim(actor: AuthContext, enrollmentId: string) {
  const enrollment = await repo.getEnrollment(enrollmentId);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('certificate.update');
  if (!isStaff && enrollment.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');

  // evaluasi (buat/update pending) memakai channel yang sama dengan endpointst evaluate
  const evaluated = await evaluate(actor, enrollmentId);
  if (!evaluated) throw AppError.internal('Could not evaluate completion eligibility', 'certificate.eligibility_check_failed');
  if (evaluated.status === 'publish') return evaluated; // sudah publish → idempoten
  if (evaluated.status !== 'eligible') {
    const why = alasanBelumLulus(evaluated.criteria_snapshot);
    throw AppError.conflict(why.message, why.key, why.details);
  }

  return withTransaction(async (tx) => {
    const locked = await repo.lockForUpdate(evaluated.id, tx);
    if (!locked) throw AppError.notFound('Certificate not found', 'certificate.not_found');
    if (locked.status === 'publish') return locked;
    const fields = await buildIssueFields();
    const issued = await repo.issue(evaluated.id, { ...fields, pdf_url: null, issued_by: null }, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'claim_issue',
        entity: 'certificates',
        entityId: evaluated.id,
        after: { status: 'publish', certificate_number: fields.certificate_number, self_service: true },
      },
      tx,
    );
    return issued;
  });
}

/** Data lengkap untuk merender desain certificate (pemilik atau staf). */
export async function renderById(actor: AuthContext, id: string) {
  const data = await repo.displayById(id);
  if (!data) throw AppError.notFound('Certificate not found', 'certificate.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('certificate.update');
  if (!isStaff && data.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return { ...data, verify_url: data.certificate_number ? verifyUrl(data.certificate_number) : null };
}

/** Exception path — requires Director approval, explicitly logged in audit_log. */
export async function exceptionIssue(actor: AuthContext, input: ExceptionIssueInput) {
  if (!isDirektur(actor)) {
    throw AppError.forbidden('Issuing by exception requires Director approval', 'certificate.override_requires_director');
  }
  const enrollment = await repo.getEnrollment(input.enrollment_id);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');

  return withTransaction(async (tx) => {
    let cert = await repo.findActiveByEnrollment(input.enrollment_id);
    if (!cert) {
      cert = await repo.insertPending(
        {
          user_id: enrollment.user_id,
          course_id: enrollment.course_id,
          enrollment_id: input.enrollment_id,
          template_id: input.template_id ?? null,
          status: 'eligible',
          criteria_snapshot: { pengecualian: true, reason: input.reason },
        },
        tx,
      );
    }
    const locked = await repo.lockForUpdate(cert.id, tx);
    if (!locked) throw AppError.notFound('Certificate not found', 'certificate.not_found');
    if (locked.status === 'publish') throw AppError.conflict('This certificate has already been issued', 'certificate.already_issued');
    const fields = await buildIssueFields();
    const number = fields.certificate_number;
    const issued = await repo.issue(cert.id, { ...fields, pdf_url: null, issued_by: actor.userId }, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'exception_issue',
        entity: 'certificates',
        entityId: cert.id,
        after: { certificate_number: number, enrollment_id: input.enrollment_id },
        reason: input.reason,
      },
      tx,
    );
    return issued;
  });
}

export async function reissue(actor: AuthContext, certificateId: string, input: ReissueInput) {
  if (!isSuper(actor) && !actor.permissions.has('certificate.update')) {
    throw AppError.forbidden('You need the certificate.update permission', 'permission.certificate_update_required');
  }
  return withTransaction(async (tx) => {
    const old = await repo.lockForUpdate(certificateId, tx);
    if (!old) throw AppError.notFound('Certificate not found', 'certificate.not_found');
    if (old.status !== 'publish') throw AppError.conflict('Only an issued certificate can be reissued', 'certificate.only_issued_can_be_reissued');
    const number = await generateUniqueNomor();
    const kodeVerifikasi = nanoid(32);
    const fresh = await repo.insertIssuedCopy(
      {
        user_id: old.user_id,
        course_id: old.course_id,
        enrollment_id: old.enrollment_id,
        template_id: old.template_id,
        certificate_number: number,
        verification_code: kodeVerifikasi,
        criteria_snapshot: old.criteria_snapshot,
        supersedes_certificate_id: old.id,
        issued_by: actor.userId,
      },
      tx,
    );
    await repo.revoke(old.id, input.reason, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'reissue',
        entity: 'certificates',
        entityId: fresh.id,
        before: { supersedes: old.id, number_lama: old.certificate_number },
        after: { certificate_number: number },
        reason: input.reason,
      },
      tx,
    );
    return fresh;
  });
}

export async function revoke(actor: AuthContext, certificateId: string, input: RevokeInput) {
  if (!isSuper(actor) && !actor.permissions.has('certificate.update')) {
    throw AppError.forbidden('You need the certificate.update permission', 'permission.certificate_update_required');
  }
  const cert = await repo.detail(certificateId);
  if (!cert) throw AppError.notFound('Certificate not found', 'certificate.not_found');
  await repo.revoke(certificateId, input.reason);
  await recordAudit({
    userId: actor.userId,
    module: 'certificate',
    action: 'revoke',
    entity: 'certificates',
    entityId: certificateId,
    reason: input.reason,
  });
  return repo.detail(certificateId);
}

export async function verify(number: string) {
  const result = await repo.verifyByNomor(number);
  if (!result) return { status: 'tidak_ditemukan' as const };
  return result;
}

// ── Certificate templates (admin) ──────────────────────────

export async function listTemplates(p: PageParams) {
  return repo.listTemplates(p);
}

export async function createTemplate(actor: AuthContext, input: CreateTemplateInput) {
  if (input.is_default) await repo.clearDefaultTemplate();
  const tpl = await repo.insertTemplate({
    name: input.name,
    description: input.description ?? null,
    layout: input.layout,
    category_id: input.category_id ?? null,
    course_id: input.course_id ?? null,
    is_default: input.is_default,
    is_active: input.is_active,
  });
  await recordAudit({ userId: actor.userId, module: 'certificate', action: 'create_template', entity: 'certificate_templates', entityId: tpl.id });
  return tpl;
}

export async function updateTemplate(actor: AuthContext, id: string, input: UpdateTemplateInput) {
  const tpl = await repo.getTemplate(id);
  if (!tpl) throw AppError.notFound('Template not found', 'template.not_found');
  if (input.is_default) await repo.clearDefaultTemplate();
  await repo.updateTemplate(id, input as Record<string, unknown>);
  await recordAudit({ userId: actor.userId, module: 'certificate', action: 'update_template', entity: 'certificate_templates', entityId: id, before: tpl, after: input });
  return repo.getTemplate(id);
}

export async function deleteTemplate(actor: AuthContext, id: string) {
  const tpl = await repo.getTemplate(id);
  if (!tpl) throw AppError.notFound('Template not found', 'template.not_found');
  await repo.softDeleteTemplate(id);
  await recordAudit({ userId: actor.userId, module: 'certificate', action: 'delete_template', entity: 'certificate_templates', entityId: id });
}

// ── Badges & gamifikasi ─────────────────────────────────────

export async function listBadges(p: PageParams) {
  return repo.listBadges(p);
}

export async function createBadge(actor: AuthContext, input: CreateBadgeInput) {
  const badge = await repo.insertBadge({
    kode: input.kode,
    name: input.name,
    description: input.description ?? null,
    criteria: input.criteria,
    icon_url: input.icon_url ?? null,
    is_active: input.is_active,
  });
  await recordAudit({ userId: actor.userId, module: 'gamification', action: 'create_badge', entity: 'badges', entityId: badge.id });
  return badge;
}

export async function myBadges(actor: AuthContext) {
  return repo.listUserBadges(actor.userId);
}

export async function awardBadge(actor: AuthContext, badgeId: string, input: AwardBadgeInput) {
  const badge = await repo.getBadge(badgeId);
  if (!badge) throw AppError.notFound('Badge not found', 'badge.not_found');
  const existing = await repo.findUserBadge(input.user_id, badgeId);
  if (existing) throw AppError.conflict('This user already has that badge', 'badge.already_awarded');
  const row = await repo.awardBadge({ user_id: input.user_id, badge_id: badgeId, course_id: input.course_id ?? null });
  await recordAudit({
    userId: actor.userId,
    module: 'gamification',
    action: 'award_badge',
    entity: 'user_badges',
    entityId: row.id,
    after: { user_id: input.user_id, badge_id: badgeId },
  });
  return row;
}

export async function myPoints(actor: AuthContext, p: PageParams) {
  return repo.listPointsLedger(actor.userId, p);
}

export async function awardPoints(actor: AuthContext, input: AwardPointsInput) {
  if (!isSuper(actor) && !actor.permissions.has('gamifikasi.create')) {
    throw AppError.forbidden('You need the gamification.create permission', 'permission.gamification_create_required');
  }
  const balance = await repo.lastBalance(input.user_id);
  const saldoSetelah = input.type === 'earn' ? balance + input.amount : balance - input.amount;
  if (saldoSetelah < 0) throw AppError.badRequest('Not enough pointsts for this transaction', 'gamification.insufficient_pointsts');
  const row = await repo.insertPointsEntry({
    user_id: input.user_id,
    type: input.type,
    amount: input.amount,
    balance_after: saldoSetelah,
    source_type: input.source_type ?? 'manual_admin',
    source_id: input.source_id ?? null,
    description: input.description ?? null,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'gamification',
    action: `pointsts_${input.type}`,
    entity: 'pointsts_ledger',
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function leaderboards(filters: { period_type?: string; course_id?: string }) {
  return repo.listLeaderboards(filters);
}

export async function generateLeaderboardSnapshot(actor: AuthContext, input: LeaderboardSnapshotInput) {
  if (!isSuper(actor) && !actor.permissions.has('gamifikasi.create')) {
    throw AppError.forbidden('You need the gamification.create permission', 'permission.gamification_create_required');
  }
  const ranking = await repo.computeRanking(input.course_id ?? null);
  const data = ranking.slice(0, input.limit).map((r, idx) => ({ ...r, peringkat: idx + 1 }));
  const snapshot = await repo.insertLeaderboardSnapshot({
    period_type: input.period_type,
    period_start: input.period_start,
    period_finish: input.period_finish,
    course_id: input.course_id ?? null,
    data_json: data,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'gamification',
    action: 'leaderboard_snapshot',
    entity: 'leaderboards',
    entityId: snapshot.id,
  });
  return snapshot;
}

export async function myStreak(actor: AuthContext) {
  return repo.getStreak(actor.userId);
}

export async function recordStreakActivity(actor: AuthContext) {
  const today = new Date().toISOString().slice(0, 10);
  const current = await repo.getStreak(actor.userId);
  let hariBerjalan = 1;
  let terpanjang = 1;
  if (current) {
    if (current.last_active_date === today) {
      return current; // sudah tercatat hari ini
    }
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    hariBerjalan = current.last_active_date === yesterday ? current.current_streak_days + 1 : 1;
    terpanjang = Math.max(current.longest_streak, hariBerjalan);
  }
  return repo.upsertStreak({
    user_id: actor.userId,
    current_streak_days: hariBerjalan,
    longest_streak: terpanjang,
    last_active_date: today,
  });
}
