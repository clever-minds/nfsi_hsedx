import { query } from '../db/pool';

interface PermRow {
  module: string;
  action: string;
}

/**
 * Hitung permission efektif seorang pengguna:
 * preset role (role utama + user_roles) ⊕ override user_permissions (allow/deny).
 * `deny` menang atas `allow`. Mengembalikan Set of `module.action`.
 *
 * super_admin mendapat wildcard: Set berisi '*' → helper `can()` selalu true.
 */
export async function loadEffectivePermissions(userId: string): Promise<Set<string>> {
  // role kode pengguna (utama + tambahan)
  const roleRows = await query<{ kode: string }>(
    `SELECT DISTINCT r.kode
       FROM roles r
       WHERE r.id = (SELECT role_id FROM users WHERE id = $1)
          OR r.id IN (SELECT role_id FROM user_roles WHERE user_id = $1)`,
    [userId],
  );
  const roleKodes = roleRows.map((r) => r.kode);
  if (roleKodes.includes('super_admin')) return new Set<string>(['*']);

  // preset dari role_permissions
  const preset = await query<PermRow>(
    `SELECT DISTINCT p.module, p.action
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN roles r ON r.id = rp.role_id
      WHERE r.kode = ANY($1::text[])`,
    [roleKodes],
  );
  const eff = new Set<string>(preset.map((p) => `${p.module}.${p.action}`));

  // override per user
  const overrides = await query<PermRow & { effect: string }>(
    `SELECT p.module, p.action, up.effect
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
      WHERE up.user_id = $1`,
    [userId],
  );
  for (const o of overrides) {
    const key = `${o.module}.${o.action}`;
    if (o.effect === 'deny') eff.delete(key);
    else eff.add(key);
  }
  return eff;
}

export function can(permissions: Set<string>, key: string): boolean {
  return permissions.has('*') || permissions.has(key);
}
