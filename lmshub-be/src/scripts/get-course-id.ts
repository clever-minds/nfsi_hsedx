import { pool } from '../core/db/pool';

async function main() {
  const res = await pool.query("SELECT id, slug, judul FROM courses WHERE judul ILIKE '%fire%' OR slug ILIKE '%fire%' LIMIT 1");
  console.log(JSON.stringify(res.rows));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
