import { Client } from 'pg';
import { env } from '../core/config/env';
import { logger } from '../core/logger/logger';

/**
 * Drop & create ulang database target (dari DATABASE_URL) via koneksi ke database `postgres`.
 * MENGHAPUS SELURUH DATA. Hanya untuk dev. Jalankan lalu `migrate:up` + `seed` + `seed:demo`
 * (lihat skrip `db:reset`).
 */
async function main() {
  const url = new URL(env.DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, '');
  if (!dbName || dbName === 'postgres') {
    logger.error('That database name is not valid to reset.');
    process.exit(1);
  }
  const adminUrl = new URL(env.DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const c = new Client({ connectionString: adminUrl.toString() });
  await c.connect();
  await c.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await c.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await c.query(`CREATE DATABASE "${dbName}"`);
  await c.end();
  logger.info(`✅ Database "${dbName}" dropped and recreated. Continue with migrate + seed.`);
}

main().catch((err) => {
  logger.error({ err }, 'Database reset failed');
  process.exit(1);
});
