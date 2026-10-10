import { query, queryOne } from '../../core/db/pool';
import { withTransaction } from '../../core/db/withTransaction';
import { PageParams } from '../../core/http/pagination';

export interface BankAccountRow {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  branch: string | null;
  notes: string | null;
  is_active: boolean;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BankAccountFilters {
  q?: string;
  is_active?: boolean;
}

/** Urutan baku: account primary dulu, lalu `sort_order`, lalu name bank. */
const ORDER = `ORDER BY is_primary DESC, sort_order ASC, bank_name ASC`;

export async function list(p: PageParams, f: BankAccountFilters): Promise<{ rows: BankAccountRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  /** `$?` diganti number parameter berikutnya — satu value bisa dipakai beberapa kali. */
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace(/\$\?/g, `$${params.length}`));
  };
  if (f.q) {
    add(
      `(bank_name ILIKE '%' || $? || '%' OR account_number ILIKE '%' || $? || '%' OR account_name ILIKE '%' || $? || '%')`,
      f.q,
    );
  }
  if (f.is_active !== undefined) add('is_active = $?', f.is_active);
  const whereSql = where.join(' AND ');

  const rows = await query<BankAccountRow>(
    `SELECT * FROM bank_accounts WHERE ${whereSql} ${ORDER} LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM bank_accounts WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

/** Rekening active untuk checkout — tanpa paginasi, sort_order sama dengan register admin. */
export async function listActive(): Promise<BankAccountRow[]> {
  return query<BankAccountRow>(`SELECT * FROM bank_accounts WHERE deleted_at IS NULL AND is_active ${ORDER}`);
}

export async function detail(id: string): Promise<BankAccountRow | null> {
  return queryOne<BankAccountRow>(`SELECT * FROM bank_accounts WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function findDuplicate(namaBank: string, number: string, exceptId?: string): Promise<BankAccountRow | null> {
  const params: unknown[] = [namaBank, number];
  let sql = `SELECT * FROM bank_accounts WHERE bank_name = $1 AND account_number = $2 AND deleted_at IS NULL`;
  if (exceptId) {
    params.push(exceptId);
    sql += ` AND id <> $3`;
  }
  return queryOne<BankAccountRow>(sql, params);
}

export interface BankAccountData {
  bank_name: string;
  account_number: string;
  account_name: string;
  branch: string | null;
  notes: string | null;
  is_active: boolean;
  is_primary: boolean;
  sort_order: number;
}

/**
 * save account. Bila baris ini ditandai primary, tanda primary pada baris lain dilepas
 * di transaction yang sama — indeks unik parsial menolak dua baris primary sekaligus.
 */
export async function insert(data: BankAccountData): Promise<{ id: string }> {
  return withTransaction(async (tx) => {
    if (data.is_primary) await tx.query(`UPDATE bank_accounts SET is_primary = false WHERE is_primary AND deleted_at IS NULL`);
    const res = await tx.query<{ id: string }>(
      `INSERT INTO bank_accounts (bank_name, account_number, account_name, branch, notes, is_active, is_primary, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        data.bank_name,
        data.account_number,
        data.account_name,
        data.branch,
        data.notes,
        data.is_active,
        data.is_primary,
        data.sort_order,
      ],
    );
    return res.rows[0];
  });
}

export async function update(id: string, fields: Partial<BankAccountData>): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;

  await withTransaction(async (tx) => {
    if (fields.is_primary) {
      await tx.query(`UPDATE bank_accounts SET is_primary = false WHERE is_primary AND id <> $1 AND deleted_at IS NULL`, [id]);
    }
    const sets = entries.map(([k], i) => `${k} = $${i + 2}`);
    await tx.query(`UPDATE bank_accounts SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
      id,
      ...entries.map(([, v]) => v),
    ]);
  });
}

export async function softDelete(id: string): Promise<void> {
  // Rekening yang dihapus no boleh menyandera tanda "primary".
  await query(`UPDATE bank_accounts SET deleted_at = now(), is_primary = false, updated_at = now() WHERE id = $1`, [id]);
}
