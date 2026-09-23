import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    await pool.query("UPDATE users SET email = 'admin@lms.com' WHERE email = 'admi@lms.com'");
    console.log('Email updated successfully to admin@lms.com!');
  } catch (err) {
    console.error('Error updating user:', err);
  } finally {
    pool.end();
  }
}

main();
