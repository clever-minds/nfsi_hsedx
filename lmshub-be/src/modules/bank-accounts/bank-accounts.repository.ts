import { query, queryOne } from '../../core/db/pool';
import { withTransaction } from '../../core/db/withTransaction';
import { PageParams } from '../../core/http/pagination';

export interface BankAccountRow {
  id: string;
  nama_bank: string;
  nomor_rekening: string;
  atas_nama: string;
  cabang: string | null;
  catatan: string | null;
  is_aktif: boolean;
  is_utama: boolean;
  urutan: number;
  created_at: string;
  updated_at: string;
}

export interface BankAccountFilters {
  q?: string;
  is_aktif?: boolean;
}

/** Urutan baku: rekening utama dulu, lalu `urutan`, lalu nama bank. */
const ORDER = `ORDER BY is_utama DESC, urutan ASC, nama_bank ASC`;

export async function list(p: PageParams, f: BankAccountFilters): Promise<{ rows: BankAccountRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  /** `$?` diganti nomor parameter berikutnya — satu nilai bisa dipakai beberapa kali. */
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace(/\$\?/g, `$${params.length}`));
  };
  if (f.q) {
    add(
      `(nama_bank ILIKE '%' || $? || '%' OR nomor_rekening ILIKE '%' || $? || '%' OR atas_nama ILIKE '%' || $? || '%')`,
      f.q,
    );
  }
  if (f.is_aktif !== undefined) add('is_aktif = $?', f.is_aktif);
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

/** Rekening aktif untuk checkout — tanpa paginasi, urutan sama dengan daftar admin. */
export async function listActive(): Promise<BankAccountRow[]> {
  return query<BankAccountRow>(`SELECT * FROM bank_accounts WHERE deleted_at IS NULL AND is_aktif ${ORDER}`);
}

export async function detail(id: string): Promise<BankAccountRow | null> {
  return queryOne<BankAccountRow>(`SELECT * FROM bank_accounts WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function findDuplicate(namaBank: string, nomor: string, exceptId?: string): Promise<BankAccountRow | null> {
  const params: unknown[] = [namaBank, nomor];
  let sql = `SELECT * FROM bank_accounts WHERE nama_bank = $1 AND nomor_rekening = $2 AND deleted_at IS NULL`;
  if (exceptId) {
    params.push(exceptId);
    sql += ` AND id <> $3`;
  }
  return queryOne<BankAccountRow>(sql, params);
}

export interface BankAccountData {
  nama_bank: string;
  nomor_rekening: string;
  atas_nama: string;
  cabang: string | null;
  catatan: string | null;
  is_aktif: boolean;
  is_utama: boolean;
  urutan: number;
}

/**
 * Simpan rekening. Bila baris ini ditandai utama, tanda utama pada baris lain dilepas
 * di transaksi yang sama — indeks unik parsial menolak dua baris utama sekaligus.
 */
export async function insert(data: BankAccountData): Promise<{ id: string }> {
  return withTransaction(async (tx) => {
    if (data.is_utama) await tx.query(`UPDATE bank_accounts SET is_utama = false WHERE is_utama AND deleted_at IS NULL`);
    const res = await tx.query<{ id: string }>(
      `INSERT INTO bank_accounts (nama_bank, nomor_rekening, atas_nama, cabang, catatan, is_aktif, is_utama, urutan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        data.nama_bank,
        data.nomor_rekening,
        data.atas_nama,
        data.cabang,
        data.catatan,
        data.is_aktif,
        data.is_utama,
        data.urutan,
      ],
    );
    return res.rows[0];
  });
}

export async function update(id: string, fields: Partial<BankAccountData>): Promise<void> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;

  await withTransaction(async (tx) => {
    if (fields.is_utama) {
      await tx.query(`UPDATE bank_accounts SET is_utama = false WHERE is_utama AND id <> $1 AND deleted_at IS NULL`, [id]);
    }
    const sets = entries.map(([k], i) => `${k} = $${i + 2}`);
    await tx.query(`UPDATE bank_accounts SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
      id,
      ...entries.map(([, v]) => v),
    ]);
  });
}

export async function softDelete(id: string): Promise<void> {
  // Rekening yang dihapus tidak boleh menyandera tanda "utama".
  await query(`UPDATE bank_accounts SET deleted_at = now(), is_utama = false, updated_at = now() WHERE id = $1`, [id]);
}
