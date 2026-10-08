import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

/** Baris tabel `categories`. */
export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ikon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CategoryFilters {
  q?: string;
  is_active?: boolean;
}

/**
 * Baris untuk layar kelola kategori. `jumlah_kursus` menghitung SEMUA course
 * yang belum dihapus, bukan hanya yang terbit: yang menahan penghapusan
 * kategori adalah foreign key `courses.category_id` (ON DELETE RESTRICT), dan
 * course draf pun menahannya. Angka yang hanya menghitung course terbit akan
 * menampilkan "0" pada kategori yang tetap menolak dihapus.
 */
export interface CategoryListRow extends CategoryRow {
  jumlah_kursus: number;
}

/** Baris `tags`. */
export interface TagRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface TagFilters {
  q?: string;
}

// ── Categories ───────────────────────────────────────
export async function list(p: PageParams, f: CategoryFilters): Promise<{ rows: CategoryListRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.q) add('name ILIKE $?', `%${f.q}%`);
  if (f.is_active !== undefined) add('is_active = $?', f.is_active);

  const whereSql = where.join(' AND ');
  const sortCol = ['name', 'sort_order', 'created_at'].includes(p.sort ?? '') ? p.sort : 'sort_order';

  const rows = await query<CategoryListRow>(
    `SELECT id, name, slug, description, ikon, sort_order, is_active, created_at,
            (SELECT COUNT(*)::int FROM courses c
              WHERE c.category_id = categories.id AND c.deleted_at IS NULL) AS jumlah_kursus
       FROM categories
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${p.order}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM categories WHERE ${whereSql}`,
    params,
  );
  return { rows, total: Number(totalRow?.count ?? 0) };
}

/** PUBLIK — hanya kategori aktif + jumlah course terbit, untuk catalog pra-login. */
export async function publicList(): Promise<Array<CategoryRow & { jumlah_kursus: number }>> {
  return query<CategoryRow & { jumlah_kursus: number }>(
    `SELECT cat.id, cat.name, cat.slug, cat.description, cat.ikon, cat.sort_order, cat.is_active, cat.created_at,
            (SELECT COUNT(*)::int FROM courses c
              WHERE c.category_id = cat.id AND c.deleted_at IS NULL
                AND c.publication_status IN ('terbit','diperbarui')) AS jumlah_kursus
       FROM categories cat
      WHERE cat.deleted_at IS NULL AND cat.is_active = true
      ORDER BY cat.sort_order ASC`,
  );
}

export async function detail(id: string): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `SELECT id, name, slug, description, ikon, sort_order, is_active, created_at
       FROM categories WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function bySlug(slug: string): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `SELECT id, name, slug, description, ikon, sort_order, is_active, created_at
       FROM categories WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
}

export async function insert(data: {
  name: string;
  slug: string;
  description: string | null;
  ikon: string | null;
  sort_order: number;
  is_active: boolean;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO categories (name, slug, description, ikon, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [data.name, data.slug, data.description, data.ikon, data.sort_order, data.is_active],
  );
  return row!;
}

export async function update(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE categories SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDelete(id: string): Promise<void> {
  await query(`UPDATE categories SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function countCoursesUsing(id: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM courses WHERE category_id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return Number(row?.count ?? 0);
}

// ── Tags ─────────────────────────────────────────────
export async function listTags(p: PageParams, f: TagFilters): Promise<{ rows: TagRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`name ILIKE $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const sortCol = ['name', 'created_at'].includes(p.sort ?? '') ? p.sort : 'name';

  const rows = await query<TagRow>(
    `SELECT id, name, slug, created_at
       FROM tags
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${p.order}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM tags WHERE ${whereSql}`, params);
  return { rows, total: Number(totalRow?.count ?? 0) };
}

/** PUBLIK — seluruh tag aktif, untuk filter catalog pra-login. */
export async function publicListTags(): Promise<TagRow[]> {
  return query<TagRow>(`SELECT id, name, slug, created_at FROM tags WHERE deleted_at IS NULL ORDER BY name ASC`);
}

export async function detailTag(id: string): Promise<TagRow | null> {
  return queryOne<TagRow>(`SELECT id, name, slug, created_at FROM tags WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function tagBySlug(slug: string): Promise<TagRow | null> {
  return queryOne<TagRow>(`SELECT id, name, slug, created_at FROM tags WHERE slug = $1 AND deleted_at IS NULL`, [slug]);
}

export async function insertTag(data: { name: string; slug: string }): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(`INSERT INTO tags (name, slug) VALUES ($1,$2) RETURNING id`, [
    data.name,
    data.slug,
  ]);
  return row!;
}

export async function updateTag(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE tags SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteTag(id: string): Promise<void> {
  await query(`UPDATE tags SET deleted_at = now() WHERE id = $1`, [id]);
}

/** Dipakai guard hapus tag: hitung pemakaian via pivot `course_tags`. */
export async function countCoursesUsingTag(id: string): Promise<number> {
  const row = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM course_tags WHERE tag_id = $1`, [id]);
  return Number(row?.count ?? 0);
}
