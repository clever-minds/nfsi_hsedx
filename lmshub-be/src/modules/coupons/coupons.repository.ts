import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

/** Baris tabel `coupons`. `used_quota` dinaikkan by modul Order, bukan di sini. */
export interface CouponRow {
  id: string;
  kode: string;
  discount_type: 'persen' | 'amount';
  discount_value: string;
  max_quota: number | null;
  used_quota: number;
  min_purchase: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Filters {
  q?: string;
  is_active?: boolean;
}

const COLS = `id, kode, discount_type, discount_value, max_quota, used_quota,
              min_purchase, valid_from, valid_until, is_active, created_at`;

export async function list(p: PageParams, f: Filters): Promise<{ rows: CouponRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.q) add('kode ILIKE $?', `%${f.q}%`);
  if (f.is_active !== undefined) add('is_active = $?', f.is_active);

  const whereSql = where.join(' AND ');
  const sortCol = ['kode', 'created_at', 'valid_until'].includes(p.sort ?? '') ? p.sort : 'created_at';

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
  discount_type: string;
  discount_value: number;
  max_quota: number | null;
  min_purchase: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO coupons
       (kode, discount_type, discount_value, max_quota, min_purchase, valid_from, valid_until, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      data.kode,
      data.discount_type,
      data.discount_value,
      data.max_quota,
      data.min_purchase,
      data.valid_from,
      data.valid_until,
      data.is_active,
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
