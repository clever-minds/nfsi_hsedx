import { createApp } from './app';
import { env } from './core/config/env';
import { logger } from './core/logger/logger';
import { pool } from './core/db/pool';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 lmshub-be berjalan di http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} diterima, menutup server...`);
  server.close(async () => {
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
