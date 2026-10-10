import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

export interface UserListRow {
  id: string;
  name_lengkap: string;
  email: string | null;
  number_wa: string | null;
  role_kode: string;
  role_name: string;
  status: string;
  profile_picture?: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface Filters {
  role?: string;
  status?: string;
  created_by?: string;
  q?: string;
  subtreeOf?: string | null; // batasi to sub-tree created_by (non-super_admin)
}

export async function list(p: PageParams, f: Filters): Promise<{ rows: UserListRow[]; total: number }> {
  const where: string[] = ['u.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.role) add('r.kode = $?', f.role);
  if (f.status) add('u.status = $?', f.status);
  if (f.created_by) add('u.created_by = $?', f.created_by);
  if (f.q) add('(u.name_lengkap ILIKE $? OR u.email ILIKE $?)', `%${f.q}%`);
  if (f.subtreeOf) add('u.created_by = $?', f.subtreeOf);

  const whereSql = where.join(' AND ');
  const sortCol = ['name_lengkap', 'status', 'created_at'].includes(p.sort ?? '') ? p.sort : 'created_at';

  const rows = await query<UserListRow>(
    `SELECT u.id, u.name_lengkap, u.email, u.number_wa, r.kode AS role_kode, r.name AS role_name,
            u.status, u.created_by, cb.name_lengkap AS created_by_name, u.created_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN users cb ON cb.id = u.created_by
      WHERE ${whereSql}
      ORDER BY u.${sortCol} ${p.order}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM users u JOIN roles r ON r.id = u.role_id WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function detail(id: string): Promise<UserListRow | null> {
  return queryOne<UserListRow>(
    `SELECT u.id, u.name_lengkap, u.email, u.number_wa, r.kode AS role_kode, r.name AS role_name,
            u.status, u.profile_picture, u.created_by, cb.name_lengkap AS created_by_name, u.created_at
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN users cb ON cb.id = u.created_by
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [id],
  );
}

export async function insert(data: {
  name_lengkap: string;
  email: string | null;
  number_wa: string | null;
  password_hash: string;
  role_id: string;
  status: string;
  created_by: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (name_lengkap, email, number_wa, password_hash, role_id, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [data.name_lengkap, data.email, data.number_wa, data.password_hash, data.role_id, data.status, data.created_by],
  );
  return row!;
}

export async function update(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE users SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDelete(id: string): Promise<void> {
  await query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [id]);
  await query(`UPDATE sessions SET status = 'revoked', revoked_at = now() WHERE user_id = $1 AND status = 'active'`, [id]);
}

export async function setStatus(id: string, status: string): Promise<void> {
  await query(`UPDATE users SET status = $2 WHERE id = $1`, [id, status]);
}

export async function passwordHashById(id: string): Promise<{ password_hash: string } | null> {
  return queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

/** Akun active (belum dihapus) lain yang sudah memakai email ini — `email` citext, jadi no peka huruf. */
export async function emailTakenByOther(email: string, exceptUserId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND id <> $2 AND deleted_at IS NULL) AS ok`,
    [email, exceptUserId],
  );
  return !!row?.ok;
}

/** Email baru belum terverifikasi: penanda verifikasi lama milik alamat previous. */
export async function updateEmail(id: string, email: string): Promise<void> {
  await query(`UPDATE users SET email = $2, email_verified_at = NULL WHERE id = $1`, [id, email]);
}

export async function updatePasswordHash(id: string, password_hash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, password_hash]);
}

export async function isDescendantOf(userId: string, ancestorId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `WITH RECURSIVE tree AS (
       SELECT id, created_by FROM users WHERE id = $1
       UNION ALL
       SELECT u.id, u.created_by FROM users u JOIN tree t ON u.id = t.created_by
     ) SELECT EXISTS(SELECT 1 FROM tree WHERE created_by = $2) AS ok`,
    [userId, ancestorId],
  );
  return row?.ok ?? false;
}

export async function permissionsOf(userId: string) {
  return query<{ module: string; action: string; effect: string; source: string }>(
    `SELECT p.module, p.action, 'allow' AS effect, 'role' AS source
       FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
      WHERE r.id = (SELECT role_id FROM users WHERE id = $1)
         OR r.id IN (SELECT role_id FROM user_roles WHERE user_id = $1)
     UNION
     SELECT p.module, p.action, up.effect, 'override' AS source
       FROM permissions p JOIN user_permissions up ON up.permission_id = p.id
      WHERE up.user_id = $1`,
    [userId],
  );
}

export async function replaceUserPermissions(
  userId: string,
  grantedBy: string,
  perms: Array<{ module: string; action: string; effect: string }>,
): Promise<void> {
  await query(`DELETE FROM user_permissions WHERE user_id = $1`, [userId]);
  for (const p of perms) {
    await query(
      `INSERT INTO user_permissions (user_id, permission_id, effect, granted_by)
       SELECT $1, id, $4, $5 FROM permissions WHERE module = $2 AND action = $3
       ON CONFLICT (user_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect`,
      [userId, p.module, p.action, p.effect, grantedBy],
    );
  }
}

export async function listRoles() {
  return query<{ id: string; kode: string; name: string; level: number }>(
    `SELECT id, kode, name, level FROM roles WHERE deleted_at IS NULL ORDER BY level`,
  );
}

export async function listPermissions() {
  return query<{ module: string; action: string }>(
    `SELECT module, action FROM permissions WHERE deleted_at IS NULL ORDER BY module, action`,
  );
}

export async function roleIdByKode(kode: string): Promise<string | null> {
  const r = await queryOne<{ id: string }>(`SELECT id FROM roles WHERE kode = $1 AND deleted_at IS NULL`, [kode]);
  return r?.id ?? null;
}

export interface RoleRow {
  id: string;
  kode: string;
  name: string;
  /** Tangga wewenang: 0 = super_admin … 9 = sub_user. Makin kecil makin tinggi. */
  level: number;
}

export async function roleByKode(kode: string): Promise<RoleRow | null> {
  return queryOne<RoleRow>(`SELECT id, kode, name, level FROM roles WHERE kode = $1 AND deleted_at IS NULL`, [kode]);
}

/**
 * Level peran TERTINGGI seorang user (angka terkecil), memperhitungkan
 * peran primary `users.role_id` maupun peran tambahan di `user_roles`.
 *
 * Dibaca from basis data, bukan from klaim di dalam token: token bisa saja
 * dicetak sebelum peran seseorang diturunkan, dan keputusan siapa-boleh-memberi-
 * peran-apa no boleh bersandar pada salinan yang mungkin basi.
 */
export async function highestRoleLevelOf(userId: string): Promise<number | null> {
  const r = await queryOne<{ level: number | null }>(
    `SELECT MIN(r.level)::int AS level
       FROM roles r
      WHERE r.deleted_at IS NULL
        AND (r.id = (SELECT role_id FROM users WHERE id = $1 AND deleted_at IS NULL)
             OR r.id IN (SELECT role_id FROM user_roles WHERE user_id = $1))`,
    [userId],
  );
  return r?.level ?? null;
}
