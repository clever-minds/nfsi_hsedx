import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { logger } from '../logger/logger';

export interface AuditInput {
  userId: string | null;
  module: string;
  action: string;
  entity?: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Catat aksi ke audit_log (append-only). Menerima `tx` opsional agar ikut transaksi pemanggil.
 * Kegagalan audit tidak boleh menggagalkan operasi utama di luar transaksi (log warning).
 */
export async function recordAudit(input: AuditInput, tx?: PoolClient): Promise<void> {
  const runner = tx ?? pool;
  const sql = `INSERT INTO audit_log (user_id, module, action, entity, entity_id, nilai_lama, nilai_baru, alasan)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
  const params = [
    input.userId,
    input.module,
    input.action,
    input.entity ?? null,
    input.entityId ?? null,
    input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null,
    input.reason ?? null,
  ];
  try {
    await runner.query(sql, params);
  } catch (err) {
    if (tx) throw err; // dalam transaksi, biarkan gagal
    logger.warn({ err, module: input.module, action: input.action }, 'Failed to write audit log entry');
  }
}
