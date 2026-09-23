import { query, queryOne } from '../../core/db/pool';
import type { CreateCurrencyInput, UpdateCurrencyInput } from './currencies.validation';

export interface CurrencyRow {
  id: string;
  kode: string;
  nama: string;
  simbol: string;
  rate: string;
  desimal: number;
  is_aktif: boolean;
  urutan: number;
}

const COLUMNS = 'id, kode, nama, simbol, rate, desimal, is_aktif, urutan';

export async function list(activeOnly = false): Promise<CurrencyRow[]> {
  return query<CurrencyRow>(
    `SELECT ${COLUMNS} FROM currencies
      WHERE deleted_at IS NULL ${activeOnly ? 'AND is_aktif' : ''}
      ORDER BY urutan, kode`,
  );
}

export async function byId(id: string): Promise<CurrencyRow | null> {
  return queryOne<CurrencyRow>(`SELECT ${COLUMNS} FROM currencies WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function byKode(kode: string): Promise<CurrencyRow | null> {
  return queryOne<CurrencyRow>(
    `SELECT ${COLUMNS} FROM currencies WHERE upper(kode) = upper($1) AND deleted_at IS NULL`,
    [kode],
  );
}

export async function insert(input: CreateCurrencyInput): Promise<CurrencyRow> {
  return (await queryOne<CurrencyRow>(
    `INSERT INTO currencies (kode, nama, simbol, rate, desimal, is_aktif, urutan)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNS}`,
    [input.kode, input.nama, input.simbol, input.rate, input.desimal, input.is_aktif, input.urutan],
  ))!;
}

export async function update(id: string, input: UpdateCurrencyInput): Promise<CurrencyRow | null> {
  // COALESCE keeps every unspecified field at its stored value, so a partial
  // update cannot blank a column the caller never mentioned.
  return queryOne<CurrencyRow>(
    `UPDATE currencies SET
       nama = COALESCE($2, nama),
       simbol = COALESCE($3, simbol),
       rate = COALESCE($4, rate),
       desimal = COALESCE($5, desimal),
       is_aktif = COALESCE($6, is_aktif),
       urutan = COALESCE($7, urutan)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${COLUMNS}`,
    [
      id,
      input.nama ?? null,
      input.simbol ?? null,
      input.rate ?? null,
      input.desimal ?? null,
      input.is_aktif ?? null,
      input.urutan ?? null,
    ],
  );
}

export async function softDelete(id: string): Promise<void> {
  await query(`UPDATE currencies SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
}
