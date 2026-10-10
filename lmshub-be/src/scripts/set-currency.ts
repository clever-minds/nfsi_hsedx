import { pool } from '../core/db/pool';

async function main() {
  await pool.query("UPDATE settings SET value = 'INR' WHERE key = 'currency.code'");
  console.log("Updated currency to INR");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
