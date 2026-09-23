import crypto from 'crypto';
import { AppError } from '../../core/http/AppError';
import { hashPassword, verifyPassword } from '../../core/auth/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../core/auth/jwt';
import { withTransaction } from '../../core/db/withTransaction';
import { recordAudit } from '../../core/audit/audit';
import { env, isProd } from '../../core/config/env';
import { query } from '../../core/db/pool';
import { sendVerificationEmail } from '../../core/mail/mailer';
import { verifyGoogleIdToken } from '../../core/auth/google';
import * as repo from './auth.repository';
import { LoginInput, RegisterInput } from './auth.validation';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const REFRESH_DAYS = 30;

function publicUser(u: repo.UserRow) {
  return {
    id: u.id,
    nama_lengkap: u.nama_lengkap,
    email: u.email,
    nomor_wa: u.nomor_wa,
    status: u.status,
    foto_profil: u.foto_profil ?? null,
  };
}

async function issueTokens(user: repo.UserRow, ctx: { ua?: string; ip?: string }) {
  const roles = await repo.roleKodesOf(user.id);
  const primary = roles[0] ?? 'siswa';
  const expires = new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000);
  // buat sesi dulu (placeholder hash), lalu sign refresh dgn sid, lalu simpan hash final
  const sid = await repo.createSession({
    user_id: user.id,
    refresh_token_hash: sha256(`init:${user.id}:${Date.now()}`),
    expires_at: expires,
    user_agent: ctx.ua,
    ip_address: ctx.ip,
  });
  const refreshToken = signRefreshToken({ sub: user.id, sid });
  await query(`UPDATE sessions SET refresh_token_hash = $1 WHERE id = $2`, [sha256(refreshToken), sid]);
  const accessToken = signAccessToken({ sub: user.id, role: primary, roles });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: env.JWT_ACCESS_TTL,
    roles,
  };
}

export async function register(input: RegisterInput, ctx: { ua?: string; ip?: string }) {
  // cek konflik kontak
  if (input.email) {
    const exist = await repo.findByIdentifier(input.email);
    if (exist) throw AppError.conflict('That email address is already registered', 'user.email_taken');
  }
  if (input.nomor_wa) {
    const exist = await repo.findByIdentifier(input.nomor_wa);
    if (exist) throw AppError.conflict('That phone number is already registered', 'user.phone_taken');
  }

  const roleKode = input.sebagai === 'affiliate' ? 'marketing' : 'siswa';
  const roleId = await repo.roleIdByKode(roleKode);
  if (!roleId) throw AppError.internal('Base roles have not been seeded yet', 'rbac.base_roles_missing');
  // affiliate wajib verifikasi admin dulu; siswa langsung aktif
  const status: 'pending' | 'active' = input.sebagai === 'affiliate' ? 'pending' : 'active';
  const password_hash = await hashPassword(input.password);

  const user = await withTransaction(async (tx) => {
    const u = await repo.createUser(
      {
        nama_lengkap: input.nama_lengkap,
        email: input.email ?? null,
        nomor_wa: input.nomor_wa ?? null,
        password_hash,
        role_id: roleId,
        status,
      },
      tx,
    );
    await recordAudit(
      { userId: u.id, module: 'pengguna', action: 'register', entity: 'users', entityId: u.id, after: { roleKode, status } },
      tx,
    );
    return u;
  });

  // Kirim email verifikasi bila mendaftar via email
  let emailVerification: { sent: boolean; dev_token?: string } | null = null;
  if (input.email) {
    const ev = await issueEmailVerification(user.id, input.email, user.nama_lengkap);
    emailVerification = { sent: ev.sent, ...(isProd ? {} : { dev_token: ev.token }) };
  }

  if (status === 'pending') {
    return { user: publicUser(user), tokens: null, message: 'Akun affiliate menunggu verifikasi admin', email_verification: emailVerification };
  }
  const tokens = await issueTokens(user, ctx);
  return { user: publicUser(user), tokens, email_verification: emailVerification };
}

// ── Verifikasi email ─────────────────────────────────────────

async function issueEmailVerification(userId: string, email: string, nama: string) {
  const token = crypto.randomBytes(24).toString('hex');
  await repo.createAuthToken({
    user_id: userId,
    jenis: 'verifikasi_email',
    token_hash: sha256(token),
    channel: 'email',
    target: email,
    expires_at: new Date(Date.now() + 24 * 3600 * 1000),
  });
  const res = await sendVerificationEmail(email, nama, token);
  return { sent: res.sent, token };
}

export async function verifyEmail(token: string) {
  const row = await repo.findValidAuthToken('verifikasi_email', sha256(token));
  if (!row || !row.user_id) throw AppError.badRequest('That verification link is invalid or has expired', 'auth.verification_token_invalid');
  await repo.markEmailVerified(row.user_id);
  await repo.consumeAuthToken(row.id);
  return { ok: true, message: 'Email address verified' };
}

export async function resendVerification(userId: string) {
  const user = await repo.findById(userId);
  if (!user) throw AppError.notFound('User not found', 'user.not_found');
  if (!user.email) throw AppError.badRequest('This account has no email address', 'auth.account_without_email');
  if (await repo.isEmailVerified(userId)) return { already_verified: true, sent: false };
  const ev = await issueEmailVerification(userId, user.email, user.nama_lengkap);
  return { already_verified: false, sent: ev.sent, ...(isProd ? {} : { dev_token: ev.token }) };
}

// ── Login via Google ─────────────────────────────────────────

export async function loginWithGoogle(idToken: string, ctx: { ua?: string; ip?: string }) {
  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch (e) {
    throw AppError.unauthorized((e as Error).message || 'The Google token is not valid');
  }
  let user = await repo.findByIdentifier(profile.email);
  if (!user) {
    // buat akun siswa baru dari profil Google (email terverifikasi)
    const roleId = await repo.roleIdByKode('siswa');
    if (!roleId) throw AppError.internal('The student role has not been seeded yet', 'rbac.student_role_missing');
    const randomHash = await hashPassword(crypto.randomBytes(18).toString('hex'));
    user = await repo.createUser({
      nama_lengkap: profile.name,
      email: profile.email,
      password_hash: randomHash,
      role_id: roleId,
      status: 'active',
    });
    await repo.markEmailVerified(user.id);
  } else if (user.status !== 'active') {
    throw AppError.forbidden('This account is not active', 'auth.account_inactive');
  } else {
    await repo.markEmailVerified(user.id); // Google memverifikasi email
  }
  await repo.updateLastLogin(user.id);
  const tokens = await issueTokens(user, ctx);
  return { user: publicUser(user), tokens };
}

export async function login(input: LoginInput, ctx: { ua?: string; ip?: string }) {
  const user = await repo.findByIdentifier(input.identifier);
  if (!user || !user.password_hash) throw AppError.unauthorized('Incorrect email or password', 'auth.invalid_credentials');
  const okPass = await verifyPassword(input.password, user.password_hash);
  if (!okPass) throw AppError.unauthorized('Incorrect email or password', 'auth.invalid_credentials');
  if (user.status !== 'active') throw AppError.forbidden('This account is not active', 'auth.account_inactive');

  await repo.updateLastLogin(user.id);
  const tokens = await issueTokens(user, ctx);
  return { user: publicUser(user), tokens };
}

export async function refresh(refreshToken: string, ctx: { ua?: string; ip?: string }) {
  let payload: { sub: string; sid: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized('Your session could not be refreshed, please sign in again', 'auth.invalid_refresh_token');
  }
  const session = await repo.findActiveSession(payload.sid, sha256(refreshToken));
  if (!session) throw AppError.unauthorized('This session is no longer active', 'auth.session_inactive');
  const user = await repo.findById(payload.sub);
  if (!user || user.status !== 'active') throw AppError.unauthorized('This account is disabled', 'auth.account_disabled');

  // rotasi: revoke sesi lama, terbitkan sesi+token baru
  await repo.revokeSession(session.id);
  const tokens = await issueTokens(user, ctx);
  return { tokens };
}

export async function logout(refreshToken: string) {
  try {
    const payload = verifyRefreshToken(refreshToken);
    await repo.revokeSession(payload.sid);
  } catch {
    /* token invalid → tetap sukses (idempoten) */
  }
  return { ok: true };
}

export async function me(userId: string) {
  const user = await repo.findById(userId);
  if (!user) throw AppError.notFound('User not found', 'user.not_found');
  const roles = await repo.roleKodesOf(userId);
  return { ...publicUser(user), roles };
}
