import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

/** Baris tabel `coupons`. `kuota_terpakai` dinaikkan oleh modul Order, bukan di sini. */
export interface CouponRow {
  id: string;
  kode: string;
  tipe_potongan: 'persen' | 'nominal';
  nilai_potongan: string;
  kuota_maksimal: number | null;
  kuota_terpakai: number;
  minimum_pembelian: string | null;
  berlaku_mulai: string | null;
  berlaku_sampai: string | null;
  is_aktif: boolean;
  created_at: string;
}

export interface Filters {
  q?: string;
  is_aktif?: boolean;
}

const COLS = `id, kode, tipe_potongan, nilai_potongan, kuota_maksimal, kuota_terpakai,
              minimum_pembelian, berlaku_mulai, berlaku_sampai, is_aktif, created_at`;

export async function list(p: PageParams, f: Filters): Promise<{ rows: CouponRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.q) add('kode ILIKE $?', `%${f.q}%`);
  if (f.is_aktif !== undefined) add('is_aktif = $?', f.is_aktif);

  const whereSql = where.join(' AND ');
  const sortCol = ['kode', 'created_at', 'berlaku_sampai'].includes(p.sort ?? '') ? p.sort : 'created_at';

  const rows = await query<CouponRow>(
    `SELECT ${COLS} FROM coupons WHERE ${whereSql} ORDER BY ${sortCol} ${p.order} LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM coupons WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function detail(id: string): Promise<CouponRow | null> {
  return queryOne<CouponRow>(`SELECT ${COLS} FROM coupons WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function byKode(kode: string): Promise<CouponRow | null> {
  return queryOne<CouponRow>(`SELECT ${COLS} FROM coupons WHERE kode = $1 AND deleted_at IS NULL`, [kode]);
}

export async function insert(data: {
  kode: string;
  tipe_potongan: string;
  nilai_potongan: number;
  kuota_maksimal: number | null;
  minimum_pembelian: number | null;
  berlaku_mulai: string | null;
  berlaku_sampai: string | null;
  is_aktif: boolean;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO coupons
       (kode, tipe_potongan, nilai_potongan, kuota_maksimal, minimum_pembelian, berlaku_mulai, berlaku_sampai, is_aktif)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      data.kode,
      data.tipe_potongan,
      data.nilai_potongan,
      data.kuota_maksimal,
      data.minimum_pembelian,
      data.berlaku_mulai,
      data.berlaku_sampai,
      data.is_aktif,
    ],
  );
  return { id: row!.id };
}

export async function update(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE coupons SET ${sets} WHERE id = $1 AND deleted_at IS NULL`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDelete(id: string): Promise<void> {
  await query(`UPDATE coupons SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

/** Berapa order yang sudah memakai kupon ini — penanda apakah aman dihapus. */
export async function countOrdersUsing(id: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM orders WHERE coupon_id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return Number(row?.count ?? 0);
}
