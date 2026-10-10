import { pool, queryOne } from '../core/db/pool';
import { recordAudit } from '../core/audit/audit';

/**
 * Ganti email akun super admin from server, tanpa login.
 *
 *   npm run admin:set-email -- <email-sekarang> <email-baru>
 *
 * Untuk saat super admin no bisa login lagi (alamat lama sudah no
 * dipakai, password dilupakan bersama kotak suratnya). profile di Admin Panel
 * adalah channel normalnya; ini jalan darurat bagi pemilik server. Hanya akun
 * berperan super_admin yang bisa diubah lewat sini — akun lain diurus from
 * menu Users.
 */
async function main() {
  const [current, next] = process.argv.slice(2).map((v) => (v ?? '').trim().toLowerCase());
  if (!current || !next) {
    console.error('Usage: npm run admin:set-email -- <current-email> <new-email>');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    console.error(`"${next}" is not a valid email address.`);
    process.exit(1);
  }

  const user = await queryOne<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1 AND u.deleted_at IS NULL AND r.kode = 'super_admin'`,
    [current],
  );
  if (!user) {
    console.error(`No super admin account uses ${current}.`);
    process.exit(1);
  }
  const taken = await queryOne<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 AND id <> $2 AND deleted_at IS NULL`,
    [next, user.id],
  );
  if (taken) {
    console.error(`${next} is already used by another account.`);
    process.exit(1);
  }

  await pool.query(`UPDATE users SET email = $2, email_verified_at = NULL WHERE id = $1`, [user.id, next]);
  await recordAudit({
    userId: user.id,
    module: 'users',
    action: 'change_email_cli',
    entity: 'users',
    entityId: user.id,
    before: { email: current },
    after: { email: next },
  });
  console.log(`Super admin email changed: ${current} → ${next}. Sign in with the new address and the same password.`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
