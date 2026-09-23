import { nanoid, customAlphabet } from 'nanoid';
import QRCode from 'qrcode';
import { AppError } from '../../core/http/AppError';
import { recordAudit } from '../../core/audit/audit';
import { withTransaction } from '../../core/db/withTransaction';
import { AuthContext } from '../../core/rbac/types';
import { PageParams } from '../../core/http/pagination';
import { env } from '../../core/config/env';
import * as repo from './certificates.repository';
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

// Nomor sertifikat: prefix + tahun + 10 karakter acak alfanumerik uppercase — tidak pernah dipakai ulang.
const nomorAlphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);
const MAX_GENERATE_RETRY = 5;
const GRADUATION_MIN_PERSEN_SELESAI = 100; // syarat minimal progres selesai (default; belum ada tabel graduation_requirements terpisah)

async function generateUniqueNomor(): Promise<string> {
  for (let i = 0; i < MAX_GENERATE_RETRY; i++) {
    const nomor = `LMS-${new Date().getFullYear()}-${nomorAlphabet()}`;
    const existing = await repo.getByNomor(nomor);
    if (!existing) return nomor;
  }
  throw AppError.internal('Could not generate a unique certificate number, please try again', 'certificate.number_generation_failed');
}

/** URL publik halaman verifikasi untuk sebuah nomor sertifikat. */
export function verifyUrl(nomor: string): string {
  return `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/sertifikat/${nomor}`;
}

/** Bangun field penerbitan: nomor unik, kode verifikasi, & QR (data URI PNG) berisi URL verifikasi. */
async function buildIssueFields(): Promise<{ nomor_sertifikat: string; kode_verifikasi: string; qr_code_url: string }> {
  const nomor = await generateUniqueNomor();
  const kode = nanoid(32);
  const qr = await QRCode.toDataURL(verifyUrl(nomor), { margin: 1, width: 240 });
  return { nomor_sertifikat: nomor, kode_verifikasi: kode, qr_code_url: qr };
}

// ── Certificates ──────────────────────────────────────────

export async function list(actor: AuthContext, p: PageParams, filters: { user_id?: string; course_id?: string; status?: string }) {
  const isStaff = isSuper(actor) || actor.permissions.has('sertifikat.update');
  const scoped = isStaff ? filters : { ...filters, user_id: actor.userId };
  return repo.list(p, scoped);
}

export async function detail(actor: AuthContext, id: string) {
  const cert = await repo.detail(id);
  if (!cert) throw AppError.notFound('Certificate not found', 'certificate.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('sertifikat.update');
  if (!isStaff && cert.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return cert;
}

/**
 * Evaluasi syarat kelulusan berbasis `course_progress` (domain 03). Evaluasi lengkap lintas-domain
 * (gradebook domain 04, kehadiran domain 06) adalah engine terpisah — modul ini hanya mengevaluasi
 * progres pelajaran sebagai syarat minimal yang tersedia dalam cakupan modul ini.
 */
export async function evaluate(actor: AuthContext, enrollmentId: string) {
  const enrollment = await repo.getEnrollment(enrollmentId);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('sertifikat.update');
  if (!isStaff && enrollment.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');

  const progress = await repo.getCourseProgress(enrollmentId);
  const persenSelesai = Number(progress?.persen_selesai ?? 0);
  const memenuhiSyarat = persenSelesai >= GRADUATION_MIN_PERSEN_SELESAI;
  const snapshot = {
    persen_selesai: persenSelesai,
    min_persen_selesai: GRADUATION_MIN_PERSEN_SELESAI,
    dievaluasi_at: new Date().toISOString(),
  };

  let cert = await repo.findActiveByEnrollment(enrollmentId);
  if (!cert) {
    cert = await repo.insertPending({
      user_id: enrollment.user_id,
      course_id: enrollment.course_id,
      enrollment_id: enrollmentId,
      template_id: null,
      status: memenuhiSyarat ? 'memenuhi_syarat' : 'belum_memenuhi_syarat',
      syarat_snapshot: snapshot,
    });
  } else if (cert.status === 'belum_memenuhi_syarat' && memenuhiSyarat) {
    await repo.updateStatus(cert.id, 'memenuhi_syarat', snapshot);
    cert = await repo.detail(cert.id);
  } else if (cert.status === 'belum_memenuhi_syarat') {
    await repo.updateStatus(cert.id, 'belum_memenuhi_syarat', snapshot);
    cert = await repo.detail(cert.id);
  }
  return cert;
}

/** Penerbitan sertifikat: nomor unik + kode verifikasi, dibungkus DB transaction. */
export async function issue(actor: AuthContext, certificateId: string) {
  if (!isSuper(actor) && !actor.permissions.has('sertifikat.update')) {
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
        module: 'sertifikat',
        action: 'issue',
        entity: 'certificates',
        entityId: certificateId,
        before: { status: cert.status },
        after: { status: 'terbit', nomor_sertifikat: fields.nomor_sertifikat },
      },
      tx,
    );
    return issued;
  });
}

/**
 * Self-service siswa: evaluasi enrollment sendiri, lalu terbitkan sertifikat bila memenuhi syarat.
 * Tidak memerlukan izin `sertifikat.update` — cukup pemilik enrollment. Sistem sebagai penerbit.
 */
export async function claim(actor: AuthContext, enrollmentId: string) {
  const enrollment = await repo.getEnrollment(enrollmentId);
  if (!enrollment) throw AppError.notFound('Enrolment not found', 'enrollment.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('sertifikat.update');
  if (!isStaff && enrollment.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');

  // evaluasi (buat/update pending) memakai jalur yang sama dengan endpoint evaluate
  const evaluated = await evaluate(actor, enrollmentId);
  if (!evaluated) throw AppError.internal('Could not evaluate completion eligibility', 'certificate.eligibility_check_failed');
  if (evaluated.status === 'terbit') return evaluated; // sudah terbit → idempoten
  if (evaluated.status !== 'memenuhi_syarat') {
    const persen = (evaluated.syarat_snapshot as { persen_selesai?: number })?.persen_selesai ?? 0;
    throw AppError.conflict(`Graduation requirements not met (progress ${persen}% of ${GRADUATION_MIN_PERSEN_SELESAI}%)`, 'certificate.requirements_not_met');
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
        module: 'sertifikat',
        action: 'claim_issue',
        entity: 'certificates',
        entityId: evaluated.id,
        after: { status: 'terbit', nomor_sertifikat: fields.nomor_sertifikat, self_service: true },
      },
      tx,
    );
    return issued;
  });
}

/** Data lengkap untuk merender desain sertifikat (pemilik atau staf). */
export async function renderById(actor: AuthContext, id: string) {
  const data = await repo.displayById(id);
  if (!data) throw AppError.notFound('Certificate not found', 'certificate.not_found');
  const isStaff = isSuper(actor) || actor.permissions.has('sertifikat.update');
  if (!isStaff && data.user_id !== actor.userId) throw AppError.forbidden('This is outside your scope', 'scope.out_of_scope');
  return { ...data, verify_url: data.nomor_sertifikat ? verifyUrl(data.nomor_sertifikat) : null };
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
    const nomor = fields.nomor_sertifikat;
    const issued = await repo.issue(cert.id, { ...fields, pdf_url: null, diterbitkan_oleh: actor.userId }, tx);
    await recordAudit(
      {
        userId: actor.userId,
        module: 'sertifikat',
        action: 'exception_issue',
        entity: 'certificates',
        entityId: cert.id,
        after: { nomor_sertifikat: nomor, enrollment_id: input.enrollment_id },
        reason: input.alasan,
      },
      tx,
    );
    return issued;
  });
}

export async function reissue(actor: AuthContext, certificateId: string, input: ReissueInput) {
  if (!isSuper(actor) && !actor.permissions.has('sertifikat.update')) {
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
        nomor_sertifikat: nomor,
        kode_verifikasi: kodeVerifikasi,
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
        module: 'sertifikat',
        action: 'reissue',
        entity: 'certificates',
        entityId: fresh.id,
        before: { supersedes: old.id, nomor_lama: old.nomor_sertifikat },
        after: { nomor_sertifikat: nomor },
        reason: input.alasan,
      },
      tx,
    );
    return fresh;
  });
}

export async function revoke(actor: AuthContext, certificateId: string, input: RevokeInput) {
  if (!isSuper(actor) && !actor.permissions.has('sertifikat.update')) {
    throw AppError.forbidden('You need the certificate.update permission', 'permission.certificate_update_required');
  }
  const cert = await repo.detail(certificateId);
  if (!cert) throw AppError.notFound('Certificate not found', 'certificate.not_found');
  await repo.revoke(certificateId, input.alasan);
  await recordAudit({
    userId: actor.userId,
    module: 'sertifikat',
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
    nama: input.nama,
    deskripsi: input.deskripsi ?? null,
    layout: input.layout,
    category_id: input.category_id ?? null,
    course_id: input.course_id ?? null,
    is_default: input.is_default,
    is_aktif: input.is_aktif,
  });
  await recordAudit({ userId: actor.userId, module: 'sertifikat', action: 'create_template', entity: 'certificate_templates', entityId: tpl.id });
  return tpl;
}

export async function updateTemplate(actor: AuthContext, id: string, input: UpdateTemplateInput) {
  const tpl = await repo.getTemplate(id);
  if (!tpl) throw AppError.notFound('Template not found', 'template.not_found');
  if (input.is_default) await repo.clearDefaultTemplate();
  await repo.updateTemplate(id, input as Record<string, unknown>);
  await recordAudit({ userId: actor.userId, module: 'sertifikat', action: 'update_template', entity: 'certificate_templates', entityId: id, before: tpl, after: input });
  return repo.getTemplate(id);
}

export async function deleteTemplate(actor: AuthContext, id: string) {
  const tpl = await repo.getTemplate(id);
  if (!tpl) throw AppError.notFound('Template not found', 'template.not_found');
  await repo.softDeleteTemplate(id);
  await recordAudit({ userId: actor.userId, module: 'sertifikat', action: 'delete_template', entity: 'certificate_templates', entityId: id });
}

// ── Badges & gamifikasi ─────────────────────────────────────

export async function listBadges(p: PageParams) {
  return repo.listBadges(p);
}

export async function createBadge(actor: AuthContext, input: CreateBadgeInput) {
  const badge = await repo.insertBadge({
    kode: input.kode,
    nama: input.nama,
    deskripsi: input.deskripsi ?? null,
    kriteria: input.kriteria,
    icon_url: input.icon_url ?? null,
    is_aktif: input.is_aktif,
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
    deskripsi: input.deskripsi ?? null,
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
