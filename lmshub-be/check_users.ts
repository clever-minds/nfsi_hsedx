import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const res = await pool.query('SELECT * FROM users');
    console.log('Users in database:');
    console.table(res.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
  } finally {
    pool.end();
  }
}

main();
