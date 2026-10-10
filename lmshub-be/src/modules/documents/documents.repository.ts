import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

// ── content_pages ────────────────────────────────────────────────────────

export interface ContentPageRow {
  id: string;
  slug: string;
  title: string;
  content: unknown;
  type: 'about' | 'faq' | 'policy' | 'page';
  status: 'draft' | 'publish' | 'archived';
  meta_seo: unknown;
  show_in_footer: boolean;
  footer_sort_order: number;
  managed_by: string | null;
  publish_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PageFilters {
  type?: string;
  status?: string;
}

export async function listPages(p: PageParams, f: PageFilters): Promise<{ rows: ContentPageRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.type) add('type = $?', f.type);
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

export interface PublicPageListRow {
  slug: string;
  title: string;
  type: ContentPageRow['type'];
  show_in_footer: boolean;
  footer_sort_order: number;
}

/** Halaman publish tanpa isinya — cukup untuk menyusun tautan footer. */
export async function listPublishedPages(): Promise<PublicPageListRow[]> {
  return query<PublicPageListRow>(
    `SELECT slug, title, type, show_in_footer, footer_sort_order
       FROM content_pages
      WHERE deleted_at IS NULL AND status = 'publish'
      ORDER BY footer_sort_order, title`,
  );
}

export async function softDeletePage(id: string): Promise<void> {
  await query(`UPDATE content_pages SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function insertPage(data: {
  slug: string;
  title: string;
  content: unknown;
  type: string;
  status: string;
  meta_seo: unknown;
  publish_date: string | null;
  managed_by: string;
  show_in_footer: boolean;
  footer_sort_order: number;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO content_pages (slug, title, content, type, status, meta_seo, publish_date, managed_by,
                                show_in_footer, footer_sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      data.slug,
      data.title,
      data.content === undefined ? null : JSON.stringify(data.content),
      data.type,
      data.status,
      data.meta_seo === undefined ? null : JSON.stringify(data.meta_seo),
      data.publish_date,
      data.managed_by,
      data.show_in_footer,
      data.footer_sort_order,
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
  group: string;
  label: string;
  value_type: 'string' | 'integer' | 'numeric' | 'boolean' | 'json';
  value: string | null;
  value_json: unknown;
  unit: string | null;
  description: string | null;
  is_public: boolean;
  is_editable: boolean;
  is_encrypted: boolean;
  updated_at: string;
}

export async function listSettings(): Promise<SettingRow[]> {
  return query<SettingRow>(`SELECT * FROM settings WHERE deleted_at IS NULL ORDER BY group, key`);
}

/** Setting bertanda `is_public` — read area pra-login (mata uang, kontak, name lembaga). */
export async function listPublicSettings(): Promise<Array<Pick<SettingRow, 'key' | 'value' | 'value_type'>>> {
  return query<Pick<SettingRow, 'key' | 'value' | 'value_type'>>(
    `SELECT key, value, value_type FROM settings WHERE deleted_at IS NULL AND is_public AND NOT is_encrypted ORDER BY key`,
  );
}

export async function getSettingByKey(key: string): Promise<SettingRow | null> {
  return queryOne<SettingRow>(`SELECT * FROM settings WHERE key = $1 AND deleted_at IS NULL`, [key]);
}

export async function updateSetting(key: string, value: string | null, nilaiJson: unknown | undefined): Promise<void> {
  const fields: string[] = ['value = $2'];
  const params: unknown[] = [key, value];
  if (nilaiJson !== undefined) {
    params.push(JSON.stringify(nilaiJson));
    fields.push(`value_json = $${params.length}`);
  }
  await query(`UPDATE settings SET ${fields.join(', ')}, updated_at = now() WHERE key = $1`, params);
}

// ── audit_log (viewer, read-only) ───────────────────────────────────────

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  module: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  time: string;
}

export interface AuditLogFilters {
  modul?: string;
  userId?: string;
  from?: string;
  until?: string;
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
  if (f.from) add('a.created_at >= $?', f.from);
  if (f.until) add('a.created_at <= $?', f.until);
  const whereSql = where.join(' AND ');

  const rows = await query<AuditLogRow>(
    `SELECT a.id, a.user_id, u.name_lengkap AS user_name, a.module, a.action AS action,
            a.entity AS entity_type, a.entity_id, a.old_value, a.new_value, a.reason, a.created_at AS time
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
