import { pool } from '../core/db/pool';
import { logger } from '../core/logger/logger';

const NEW_CATEGORIES = [
  { name: 'Fire', slug: 'fire', icon: '🔥' },
  { name: 'Occupational Safety', slug: 'occupational-safety', icon: '👷' },
  { name: 'Personal Development', slug: 'personal-development', icon: '🌱' },
];

async function main() {
  logger.info('Seeding HSEdx course categories...');

  for (const c of NEW_CATEGORIES) {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO categories (nama, slug, ikon) VALUES ($1, $2, $3)
       ON CONFLICT (slug) WHERE deleted_at IS NULL 
       DO UPDATE SET nama = EXCLUDED.nama, ikon = EXCLUDED.ikon
       RETURNING id`,
      [c.name, c.slug, c.icon]
    );
    logger.info(`Upserted category: ${c.name} (ID: ${res.rows[0].id})`);
  }

  logger.info('Finished seeding categories.');
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
