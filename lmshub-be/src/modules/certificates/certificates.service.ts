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
const isDirektur = (actor: AuthContext) => isSuper(actor) || actor.roles.includes('direktur');

// Nomor certificate: prefix + tahun + 10 karakter acak alfanumerik uppercase — tidak pernah dipakai ulang.
const nomorAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);
const MAX_GENERATE_RETRY = 5;
const GRADUATION_MIN_PERSEN_SELESAI = 100; // bawaan setting `certificate.syarat_progres_min_persen`

async function generateUniqueNomor(): Promise<string> {
  for (let i = 0; i < MAX_GENERATE_RETRY; i++) {
    const nomor = `LMS-${new Date().getFullYear()}-${nomorAlphabet()}`;
    const existing = await repo.getByNomor(nomor);
    if (!existing) return nomor;
  }
  throw AppError.internal('Could not generate a unique certificate number, please try again', 'certificate.number_generation_failed');
}

/**
 * Public verification page for a certificate number. Certificates issued before
 * the English URLs carry `/certificate/…` in their QR code; the frontend
 * redirects those here, so both keep verifying.
 */
export function verifyUrl(nomor: string): string {
  return `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/certificates/${nomor}`;
}

/** Bangun field penerbitan: nomor unik, kode verifikasi, & QR (data URI PNG) berisi URL verifikasi. */
async function buildIssueFields(): Promise<{ certificate_number: string; verification_code: string; qr_code_url: string }> {
  const nomor = await generateUniqueNomor();
  const kode = nanoid(32);
  const qr = await QRCode.toDataURL(verifyUrl(nomor), { margin: 1, width: 240 });
  return { certificate_number: nomor, verification_code: kode, qr_code_url: qr };
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

/** Syarat progres minimum (persen); setting Pengaturan → Certificate, bawaan 100. */
async function minPersenSelesai(): Promise<number> {
  const n = await getSettingInt('certificate.syarat_progres_min_persen', GRADUATION_MIN_PERSEN_SELESAI);
  return Math.min(100, Math.max(0, n));
}

/**
 * Evaluasi syarat kelulusan: progres pelajaran + ujian akhir (bila course punya).
 *
 * - Progres minimum dibaca dari setting `certificate.syarat_progres_min_persen`
 *   (bawaan 100 — sama dengan perilaku sebelumnya).
 * - Ujian akhir ditunjuk per course (`courses.final_exam_quiz_id`). Lulus bila
 *   percobaan terbaik yang sudah dinilai ≥ nilai lulus quiz (atau setting
 *   `certificate.syarat_passing_score_min` bila quiz tidak mengisinya).
 * - Course tanpa ujian akhir: hanya progres, persis seperti sebelumnya.
 *
 * Certificate yang sudah terbit tidak pernah dievaluasi ulang. Yang belum terbit
 * selalu mengikuti hasil evaluasi terbaru — termasuk turun kembali ke "belum
 * memenuhi syarat" bila admin menambahkan ujian akhir setelahnya.
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
  const ujian = evaluasiUjianAkhir({
    quiz,
    skorTerbaik: quiz ? await repo.bestGradedScore(enrollmentId, quiz.id) : null,
    settingPassing,
  });
  const progresCukup = persenSelesai >= minPersen;
  const memenuhiSyarat = progresCukup && ujian.lulus;
  const snapshot = {
    progress_percent: persenSelesai,
    min_persen_selesai: minPersen,
    ujian_akhir: ujian.ada
      ? {
          quiz_id: ujian.quiz_id,
          title: ujian.title,
          passing_score_val: ujian.passing_score_val,
          skor_terbaik_persen: ujian.skor_terbaik_persen,
          lulus: ujian.lulus,
        }
      : null,
    dievaluasi_at: new Date().toISOString(),
  };
  const status = memenuhiSyarat ? 'memenuhi_syarat' : 'belum_memenuhi_syarat';

  let cert = await repo.findActiveByEnrollment(enrollmentId);
  if (!cert) {
    cert = await repo.insertPending({
      user_id: enrollment.user_id,
      course_id: enrollment.course_id,
      enrollment_id: enrollmentId,
      template_id: null,
      status,
      syarat_snapshot: snapshot,
    });
  } else if (cert.status !== 'terbit') {
    // Certificate pengecualian (jalur Direktur) tidak boleh diturunkan oleh evaluasi biasa.
    const pengecualian = (cert.syarat_snapshot as { pengecualian?: boolean } | null)?.pengecualian === true;
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
    min_persen_selesai?: number;
    ujian_akhir?: { title?: string; passing_score_val?: number; skor_terbaik_persen?: number | null; lulus?: boolean } | null;
  };
  const persen = s.progress_percent ?? 0;
  const min = s.min_persen_selesai ?? GRADUATION_MIN_PERSEN_SELESAI;
  if (persen < min) {
    return {
      message: `Graduation requirements not met (progress ${persen}% of ${min}%)`,
      key: 'certificate.requirements_not_met',
      details: s,
    };
  }
  const u = s.ujian_akhir;
  return {
    message:
      u?.skor_terbaik_persen === null || u?.skor_terbaik_persen === undefined
        ? `Pass the final exam "${u?.title ?? ''}" (minimum ${u?.passing_score_val ?? DEFAULT_PASSING_SCORE}%) to unlock your certificate`
        : `Your best final exam score is ${u.skor_terbaik_persen}% — ${u.passing_score_val}% is required to unlock your certificate`,
    key: 'certificate.final_exam_not_passed',
    details: s,
  };
}

/** Penerbitan certificate: nomor unik + kode verifikasi, dibungkus DB transaction. */
export async function issue(actor: AuthContext, certificateId: string) {
  if (!isSuper(actor) && !actor.permissions.has('certificate.update')) {
    throw AppError.forbidden('You need the certificate.update permission', 'permission.certificate_update_required');
  }
  return withTransaction(async (tx) => {
    const cert = await repo.lockForUpdate(certificateId, tx);
    if (!cert) throw AppError.notFound('Certificate not found', 'certificate.not_found');
    if (cert.status !== 'memenuhi_syarat') {
      throw AppError.conflict('A certificate can only be issued once the student is eligible', 'certificate.not_eligible');
    }
    const fields = await buildIssueFields();
    const issued = await repo.issue(certificateId, { ...fields, pdf_url: null, diterbitkan_oleh: actor.userId }, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'issue',
        entity: 'certificates',
        entityId: certificateId,
        before: { status: cert.status },
        after: { status: 'terbit', certificate_number: fields.certificate_number },
      },
      tx,
    );
    return issued;
  });
}

/**
 * Self-service student: evaluasi enrollment sendiri, lalu terbitkan certificate bila memenuhi syarat.
 * Tidak memerlukan izin `certificate.update` — cukup pemilik enrollment. Sistem sebagai penerbit.
 */
export async function claim(actor: AuthContext, enrollmentId: string) {
  const enrollment = await repo.getEnrollment(enrollmentId);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('certificate.update');
  if (!isStaff && enrollment.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');

  // evaluasi (buat/update pending) memakai jalur yang sama dengan endpoint evaluate
  const evaluated = await evaluate(actor, enrollmentId);
  if (!evaluated) throw AppError.internal('Could not evaluate completion eligibility', 'certificate.eligibility_check_failed');
  if (evaluated.status === 'terbit') return evaluated; // sudah terbit → idempoten
  if (evaluated.status !== 'memenuhi_syarat') {
    const why = alasanBelumLulus(evaluated.syarat_snapshot);
    throw AppError.conflict(why.message, why.key, why.details);
  }

  return withTransaction(async (tx) => {
    const locked = await repo.lockForUpdate(evaluated.id, tx);
    if (!locked) throw AppError.notFound('Certificate not found', 'certificate.not_found');
    if (locked.status === 'terbit') return locked;
    const fields = await buildIssueFields();
    const issued = await repo.issue(evaluated.id, { ...fields, pdf_url: null, diterbitkan_oleh: null }, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'claim_issue',
        entity: 'certificates',
        entityId: evaluated.id,
        after: { status: 'terbit', certificate_number: fields.certificate_number, self_service: true },
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

/** Jalur pengecualian — wajib approval Direktur, dicatat wajib di audit_log. */
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
          status: 'memenuhi_syarat',
          syarat_snapshot: { pengecualian: true, alasan: input.alasan },
        },
        tx,
      );
    }
    const locked = await repo.lockForUpdate(cert.id, tx);
    if (!locked) throw AppError.notFound('Certificate not found', 'certificate.not_found');
    if (locked.status === 'terbit') throw AppError.conflict('This certificate has already been issued', 'certificate.already_issued');
    const fields = await buildIssueFields();
    const nomor = fields.certificate_number;
    const issued = await repo.issue(cert.id, { ...fields, pdf_url: null, diterbitkan_oleh: actor.userId }, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'exception_issue',
        entity: 'certificates',
        entityId: cert.id,
        after: { certificate_number: nomor, enrollment_id: input.enrollment_id },
        reason: input.alasan,
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
    if (old.status !== 'terbit') throw AppError.conflict('Only an issued certificate can be reissued', 'certificate.only_issued_can_be_reissued');
    const nomor = await generateUniqueNomor();
    const kodeVerifikasi = nanoid(32);
    const fresh = await repo.insertIssuedCopy(
      {
        user_id: old.user_id,
        course_id: old.course_id,
        enrollment_id: old.enrollment_id,
        template_id: old.template_id,
        certificate_number: nomor,
        verification_code: kodeVerifikasi,
        syarat_snapshot: old.syarat_snapshot,
        supersedes_certificate_id: old.id,
        diterbitkan_oleh: actor.userId,
      },
      tx,
    );
    await repo.revoke(old.id, input.alasan, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'certificate',
        action: 'reissue',
        entity: 'certificates',
        entityId: fresh.id,
        before: { supersedes: old.id, nomor_lama: old.certificate_number },
        after: { certificate_number: nomor },
        reason: input.alasan,
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
  await repo.revoke(certificateId, input.alasan);
  await recordAudit({
    userId: actor.userId,
    module: 'certificate',
    action: 'revoke',
    entity: 'certificates',
    entityId: certificateId,
    reason: input.alasan,
  });
  return repo.detail(certificateId);
}

export async function verify(nomor: string) {
  const result = await repo.verifyByNomor(nomor);
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
    kriteria: input.kriteria,
    icon_url: input.icon_url ?? null,
    is_active: input.is_active,
  });
  await recordAudit({ userId: actor.userId, module: 'gamifikasi', action: 'create_badge', entity: 'badges', entityId: badge.id });
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
    module: 'gamifikasi',
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
  const saldoSetelah = input.jenis === 'earn' ? balance + input.jumlah : balance - input.jumlah;
  if (saldoSetelah < 0) throw AppError.badRequest('Not enough points for this transaction', 'gamification.insufficient_points');
  const row = await repo.insertPointsEntry({
    user_id: input.user_id,
    jenis: input.jenis,
    jumlah: input.jumlah,
    saldo_setelah: saldoSetelah,
    sumber_type: input.sumber_type ?? 'manual_admin',
    sumber_id: input.sumber_id ?? null,
    description: input.description ?? null,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'gamifikasi',
    action: `points_${input.jenis}`,
    entity: 'points_ledger',
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function leaderboards(filters: { periode_jenis?: string; course_id?: string }) {
  return repo.listLeaderboards(filters);
}

export async function generateLeaderboardSnapshot(actor: AuthContext, input: LeaderboardSnapshotInput) {
  if (!isSuper(actor) && !actor.permissions.has('gamifikasi.create')) {
    throw AppError.forbidden('You need the gamification.create permission', 'permission.gamification_create_required');
  }
  const ranking = await repo.computeRanking(input.course_id ?? null);
  const data = ranking.slice(0, input.limit).map((r, idx) => ({ ...r, peringkat: idx + 1 }));
  const snapshot = await repo.insertLeaderboardSnapshot({
    periode_jenis: input.periode_jenis,
    periode_mulai: input.periode_mulai,
    periode_selesai: input.periode_selesai,
    course_id: input.course_id ?? null,
    data_json: data,
  });
  await recordAudit({
    userId: actor.userId,
    module: 'gamifikasi',
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
    if (current.tanggal_terakhir_aktif === today) {
      return current; // sudah tercatat hari ini
    }
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    hariBerjalan = current.tanggal_terakhir_aktif === yesterday ? current.streak_hari_berjalan + 1 : 1;
    terpanjang = Math.max(current.streak_terpanjang, hariBerjalan);
  }
  return repo.upsertStreak({
    user_id: actor.userId,
    streak_hari_berjalan: hariBerjalan,
    streak_terpanjang: terpanjang,
    tanggal_terakhir_aktif: today,
  });
}
