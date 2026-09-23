import { query, queryOne } from '../../core/db/pool';

export interface SiteContentRow {
  id: string;
  key: string;
  nilai: unknown;
  updated_at: string;
}

export async function listAll(): Promise<SiteContentRow[]> {
  return query<SiteContentRow>(
    `SELECT id, key, nilai, updated_at FROM site_content WHERE deleted_at IS NULL ORDER BY key`,
  );
}

export async function getByKey(key: string): Promise<SiteContentRow | null> {
  return queryOne<SiteContentRow>(
    `SELECT id, key, nilai, updated_at FROM site_content WHERE key = $1 AND deleted_at IS NULL`,
    [key],
  );
}

/** Simpan blok konten; baris dibuat bila belum ada (halaman baru pertama kali diubah). */
export async function upsert(key: string, nilai: unknown): Promise<SiteContentRow> {
  const row = await queryOne<SiteContentRow>(
    `INSERT INTO site_content (key, nilai) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) WHERE deleted_at IS NULL
     DO UPDATE SET nilai = EXCLUDED.nilai
     RETURNING id, key, nilai, updated_at`,
    [key, JSON.stringify(nilai)],
  );
  return row!;
}
