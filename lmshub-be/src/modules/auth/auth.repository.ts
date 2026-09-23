import { PoolClient } from 'pg';
import { pool, query, queryOne } from '../../core/db/pool';

export interface UserRow {
  id: string;
  nama_lengkap: string;
  email: string | null;
  nomor_wa: string | null;
  password_hash: string | null;
  role_id: string;
  status: 'pending' | 'active' | 'inactive';
  foto_profil: string | null;
  is_multi_peran: boolean;
  created_by: string | null;
  created_at: string;
}

export async function roleIdByKode(kode: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(`SELECT id FROM roles WHERE kode = $1 AND deleted_at IS NULL`, [kode]);
  return row?.id ?? null;
}

export async function findByIdentifier(identifier: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT * FROM users WHERE deleted_at IS NULL AND (email = $1 OR nomor_wa = $1) LIMIT 1`,
    [identifier],
  );
}

export async function findById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function roleKodesOf(userId: string): Promise<string[]> {
  const rows = await query<{ kode: string }>(
    `SELECT r.kode FROM roles r
       WHERE r.id = (SELECT role_id FROM users WHERE id = $1)
          OR r.id IN (SELECT role_id FROM user_roles WHERE user_id = $1)`,
    [userId],
  );
  return rows.map((r) => r.kode);
}

export async function createUser(
  data: {
    nama_lengkap: string;
    email?: string | null;
    nomor_wa?: string | null;
    password_hash: string;
    role_id: string;
    status: 'pending' | 'active';
    created_by?: string | null;
  },
  tx?: PoolClient,
): Promise<UserRow> {
  const runner = tx ?? pool;
  const res = await runner.query<UserRow>(
    `INSERT INTO users (nama_lengkap, email, nomor_wa, password_hash, role_id, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      data.nama_lengkap,
      data.email ?? null,
      data.nomor_wa ?? null,
      data.password_hash,
      data.role_id,
      data.status,
      data.created_by ?? null,
    ],
  );
  return res.rows[0];
}

export async function updateLastLogin(userId: string): Promise<void> {
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}

export async function createSession(data: {
  user_id: string;
  refresh_token_hash: string;
  expires_at: Date;
  user_agent?: string | null;
  ip_address?: string | null;
}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO sessions (user_id, refresh_token_hash, expires_at, user_agent, ip_address)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.user_id, data.refresh_token_hash, data.expires_at, data.user_agent ?? null, data.ip_address ?? null],
  );
  return row!.id;
}

export async function findActiveSession(id: string, tokenHash: string) {
  return queryOne<{ id: string; user_id: string; status: string; expires_at: string }>(
    `SELECT id, user_id, status, expires_at FROM sessions
      WHERE id = $1 AND refresh_token_hash = $2 AND status = 'aktif' AND expires_at > now()`,
    [id, tokenHash],
  );
}

export async function revokeSession(id: string): Promise<void> {
  await query(`UPDATE sessions SET status = 'revoked', revoked_at = now() WHERE id = $1`, [id]);
}

// ── auth_tokens (verifikasi email, reset, dll) ──────────────

export async function createAuthToken(data: {
  user_id: string | null;
  jenis: string;
  token_hash: string;
  channel?: string | null;
  target?: string | null;
  expires_at: Date;
}): Promise<void> {
  await query(
    `INSERT INTO auth_tokens (user_id, jenis, token_hash, channel, target, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [data.user_id, data.jenis, data.token_hash, data.channel ?? null, data.target ?? null, data.expires_at],
  );
}

export async function findValidAuthToken(jenis: string, tokenHash: string) {
  return queryOne<{ id: string; user_id: string | null; target: string | null }>(
    `SELECT id, user_id, target FROM auth_tokens
      WHERE jenis = $1 AND token_hash = $2 AND consumed_at IS NULL AND expires_at > now()
      LIMIT 1`,
    [jenis, tokenHash],
  );
}

export async function consumeAuthToken(id: string): Promise<void> {
  await query(`UPDATE auth_tokens SET consumed_at = now() WHERE id = $1`, [id]);
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query(`UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL`, [userId]);
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  const row = await queryOne<{ v: boolean }>(
    `SELECT (email_verified_at IS NOT NULL) AS v FROM users WHERE id = $1`,
    [userId],
  );
  return row?.v ?? false;
}
