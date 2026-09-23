import { pool, queryOne } from '../core/db/pool';
import { env, isProd } from '../core/config/env';
import { hashPassword } from '../core/auth/password';
import { logger } from '../core/logger/logger';
import { installDefaultBrandAssets } from './brand-defaults';
import { alasanKredensialBootstrapLemah } from '../core/config/bootstrap-credentials';

/** Buat akun super admin bootstrap dari env + pasang merek bawaan (idempoten). */
async function main() {
  const role = await queryOne<{ id: string }>(`SELECT id FROM roles WHERE kode = 'super_admin'`);
  if (!role) {
    logger.error('The super_admin role does not exist yet. Run `npm run migrate:up` first.');
    process.exit(1);
  }

  // Kredensial bootstrap tercetak di `.env.example` dan di dalam manual, jadi di
  // produksi ia bukan "nilai bawaan" melainkan akun super admin yang kata
  // sandinya diketahui setiap pembeli produk ini. Wizard pemasangan web
  // menanyakan akun admin sendiri; yang dijaga di sini adalah pemasangan manual
  // yang menjalankan `npm run seed` tanpa menyentuh dua baris itu.
  //
  // Membandingkan dengan satu literal ter-hardcode adalah yang gagal pada rahasia
  // JWT: `.env.example` disunting, konstanta di sini tidak, dan guard-nya diam
  // justru untuk pembeli yang hendak dilindunginya. Jadi yang diperiksa di sini
  // adalah BENTUK placeholder-nya, dan `tests/unit/security-guards.test.ts`
  // membaca `.env.example` yang sungguhan lalu gagal bila nilainya lolos.
  if (isProd) {
    const bawaan: string[] = [];
    if (alasanKredensialBootstrapLemah(env.BOOTSTRAP_ADMIN_PASSWORD)) bawaan.push('BOOTSTRAP_ADMIN_PASSWORD');
    if (alasanKredensialBootstrapLemah(env.BOOTSTRAP_ADMIN_EMAIL)) bawaan.push('BOOTSTRAP_ADMIN_EMAIL');
    if (bawaan.length) {
      logger.error(
        `${bawaan.join(' and ')} still holds an example value. ` +
          'Set your own email address and password in .env before seeding a production server.',
      );
      process.exit(1);
    }
  }

  const existing = await queryOne<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    env.BOOTSTRAP_ADMIN_EMAIL,
  ]);

  if (existing) {
    logger.info(`Super admin already exists: ${env.BOOTSTRAP_ADMIN_EMAIL}`);
  } else {
    const hash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);
    await pool.query(
      `INSERT INTO users (nama_lengkap, email, password_hash, role_id, status, email_verified_at)
       VALUES ($1,$2,$3,$4,'active', now())`,
      [env.BOOTSTRAP_ADMIN_NAME, env.BOOTSTRAP_ADMIN_EMAIL, hash, role.id],
    );
    logger.info(`Super admin created: ${env.BOOTSTRAP_ADMIN_EMAIL} (password from .env)`);
  }

  // Dijalankan walau super admin sudah ada: seed versi lama tidak memasang merek,
  // jadi sistem yang di-seed sebelum ini tetap mendapat logonya saat seed diulang.
  await installDefaultBrandAssets();

  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
