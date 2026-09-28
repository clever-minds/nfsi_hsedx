import { PoolClient } from 'pg';
import { pool } from './pool';

/**
 * Jalankan `fn` dalam satu DB transaction. WAJIB dipakai untuk operasi finansial
 * (pembayaran, komisi, payout, refund) & penerbitan sertifikat.
 */
export async function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback error */
    }
    throw err;
  } finally {
    client.release();
  }
}
