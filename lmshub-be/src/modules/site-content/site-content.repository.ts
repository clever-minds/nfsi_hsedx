import { query, queryOne } from '../../core/db/pool';

export interface SiteContentRow {
  id: string;
  key: string;
  value: unknown;
  updated_at: string;
}

export async function listAll(): Promise<SiteContentRow[]> {
  return query<SiteContentRow>(
    `SELECT id, key, value, updated_at FROM site_content WHERE deleted_at IS NULL ORDER BY key`,
  );
}

export async function getByKey(key: string): Promise<SiteContentRow | null> {
  return queryOne<SiteContentRow>(
    `SELECT id, key, value, updated_at FROM site_content WHERE key = $1 AND deleted_at IS NULL`,
    [key],
  );
}

/** save blok content; baris created bila belum ada (halaman baru pertama kali diubah). */
export async function upsert(key: string, value: unknown): Promise<SiteContentRow> {
  const row = await queryOne<SiteContentRow>(
    `INSERT INTO site_content (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) WHERE deleted_at IS NULL
     DO UPDATE SET value = EXCLUDED.value
     RETURNING id, key, value, updated_at`,
    [key, JSON.stringify(value)],
  );
  return row!;
}
