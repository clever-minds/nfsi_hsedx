import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

// ── content_pages ────────────────────────────────────────────────────────

export interface ContentPageRow {
  id: string;
  slug: string;
  judul: string;
  konten: unknown;
  tipe: 'tentang' | 'faq' | 'kebijakan' | 'halaman';
  status: 'draft' | 'terbit' | 'arsip';
  meta_seo: unknown;
  dikelola_oleh: string | null;
  tanggal_terbit: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageFilters {
  tipe?: string;
  status?: string;
}

export async function listPages(p: PageParams, f: PageFilters): Promise<{ rows: ContentPageRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.tipe) add('tipe = $?', f.tipe);
  if (f.status) add('status = $?', f.status);
  const whereSql = where.join(' AND ');

  const rows = await query<ContentPageRow>(
    `SELECT * FROM content_pages WHERE ${whereSql} ORDER BY updated_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM content_pages WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

export async function getPageBySlug(slug: string): Promise<ContentPageRow | null> {
  return queryOne<ContentPageRow>(`SELECT * FROM content_pages WHERE slug = $1 AND deleted_at IS NULL`, [slug]);
}

export async function getPageById(id: string): Promise<ContentPageRow | null> {
  return queryOne<ContentPageRow>(`SELECT * FROM content_pages WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function insertPage(data: {
  slug: string;
  judul: string;
  konten: unknown;
  tipe: string;
  status: string;
  meta_seo: unknown;
  tanggal_terbit: string | null;
  dikelola_oleh: string;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO content_pages (slug, judul, konten, tipe, status, meta_seo, tanggal_terbit, dikelola_oleh)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      data.slug,
      data.judul,
      data.konten === undefined ? null : JSON.stringify(data.konten),
      data.tipe,
      data.status,
      data.meta_seo === undefined ? null : JSON.stringify(data.meta_seo),
      data.tanggal_terbit,
      data.dikelola_oleh,
    ],
  );
  return row!;
}

export async function updatePage(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE content_pages SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

// ── settings ─────────────────────────────────────────────────────────────

export interface SettingRow {
  id: string;
  key: string;
  grup: string;
  label: string;
  tipe_nilai: 'string' | 'integer' | 'numeric' | 'boolean' | 'json';
  nilai: string | null;
  nilai_json: unknown;
  satuan: string | null;
  deskripsi: string | null;
  is_public: boolean;
  is_editable: boolean;
  is_encrypted: boolean;
  updated_at: string;
}

export async function listSettings(): Promise<SettingRow[]> {
  return query<SettingRow>(`SELECT * FROM settings WHERE deleted_at IS NULL ORDER BY grup, key`);
}

/** Setting bertanda `is_public` — dibaca area pra-login (mata uang, kontak, nama lembaga). */
export async function listPublicSettings(): Promise<Array<Pick<SettingRow, 'key' | 'nilai' | 'tipe_nilai'>>> {
  return query<Pick<SettingRow, 'key' | 'nilai' | 'tipe_nilai'>>(
    `SELECT key, nilai, tipe_nilai FROM settings WHERE deleted_at IS NULL AND is_public AND NOT is_encrypted ORDER BY key`,
  );
}

export async function getSettingByKey(key: string): Promise<SettingRow | null> {
  return queryOne<SettingRow>(`SELECT * FROM settings WHERE key = $1 AND deleted_at IS NULL`, [key]);
}

export async function updateSetting(key: string, nilai: string | null, nilaiJson: unknown | undefined): Promise<void> {
  const fields: string[] = ['nilai = $2'];
  const params: unknown[] = [key, nilai];
  if (nilaiJson !== undefined) {
    params.push(JSON.stringify(nilaiJson));
    fields.push(`nilai_json = $${params.length}`);
  }
  await query(`UPDATE settings SET ${fields.join(', ')}, updated_at = now() WHERE key = $1`, params);
}

// ── audit_log (viewer, read-only) ───────────────────────────────────────

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_nama: string | null;
  module: string;
  aksi: string;
  entity_type: string | null;
  entity_id: string | null;
  nilai_lama: unknown;
  nilai_baru: unknown;
  alasan: string | null;
  waktu: string;
}

export interface AuditLogFilters {
  modul?: string;
  userId?: string;
  dari?: string;
  sampai?: string;
}

export async function listAuditLog(
  p: PageParams,
  f: AuditLogFilters,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const where: string[] = ['1=1'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.modul) add('a.module = $?', f.modul);
  if (f.userId) add('a.user_id = $?', f.userId);
  if (f.dari) add('a.created_at >= $?', f.dari);
  if (f.sampai) add('a.created_at <= $?', f.sampai);
  const whereSql = where.join(' AND ');

  const rows = await query<AuditLogRow>(
    `SELECT a.id, a.user_id, u.nama_lengkap AS user_nama, a.module, a.action AS aksi,
            a.entity AS entity_type, a.entity_id, a.nilai_lama, a.nilai_baru, a.alasan, a.created_at AS waktu
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE ${whereSql} ORDER BY a.created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM audit_log a WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}
