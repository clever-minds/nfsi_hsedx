import { query, queryOne } from '../../core/db/pool';
import { PageParams } from '../../core/http/pagination';

/** Baris tabel `categories`. */
export interface CategoryRow {
  id: string;
  nama: string;
  slug: string;
  deskripsi: string | null;
  ikon: string | null;
  urutan: number;
  is_aktif: boolean;
  created_at: string;
}

export interface CategoryFilters {
  q?: string;
  is_aktif?: boolean;
}

/** Baris `tags`. */
export interface TagRow {
  id: string;
  nama: string;
  slug: string;
  created_at: string;
}

export interface TagFilters {
  q?: string;
}

// ── Categories ───────────────────────────────────────
export async function list(p: PageParams, f: CategoryFilters): Promise<{ rows: CategoryRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace('$?', `$${params.length}`));
  };
  if (f.q) add('nama ILIKE $?', `%${f.q}%`);
  if (f.is_aktif !== undefined) add('is_aktif = $?', f.is_aktif);

  const whereSql = where.join(' AND ');
  const sortCol = ['nama', 'urutan', 'created_at'].includes(p.sort ?? '') ? p.sort : 'urutan';

  const rows = await query<CategoryRow>(
    `SELECT id, nama, slug, deskripsi, ikon, urutan, is_aktif, created_at
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

/** PUBLIK — hanya kategori aktif + jumlah kursus terbit, untuk katalog pra-login. */
export async function publicList(): Promise<Array<CategoryRow & { jumlah_kursus: number }>> {
  return query<CategoryRow & { jumlah_kursus: number }>(
    `SELECT cat.id, cat.nama, cat.slug, cat.deskripsi, cat.ikon, cat.urutan, cat.is_aktif, cat.created_at,
            (SELECT COUNT(*)::int FROM courses c
              WHERE c.category_id = cat.id AND c.deleted_at IS NULL
                AND c.status_publikasi IN ('terbit','diperbarui')) AS jumlah_kursus
       FROM categories cat
      WHERE cat.deleted_at IS NULL AND cat.is_aktif = true
      ORDER BY cat.urutan ASC`,
  );
}

export async function detail(id: string): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `SELECT id, nama, slug, deskripsi, ikon, urutan, is_aktif, created_at
       FROM categories WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function bySlug(slug: string): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `SELECT id, nama, slug, deskripsi, ikon, urutan, is_aktif, created_at
       FROM categories WHERE slug = $1 AND deleted_at IS NULL`,
    [slug],
  );
}

export async function insert(data: {
  nama: string;
  slug: string;
  deskripsi: string | null;
  ikon: string | null;
  urutan: number;
  is_aktif: boolean;
}): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO categories (nama, slug, deskripsi, ikon, urutan, is_aktif)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [data.nama, data.slug, data.deskripsi, data.ikon, data.urutan, data.is_aktif],
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
    where.push(`nama ILIKE $${params.length}`);
  }
  const whereSql = where.join(' AND ');
  const sortCol = ['nama', 'created_at'].includes(p.sort ?? '') ? p.sort : 'nama';

  const rows = await query<TagRow>(
    `SELECT id, nama, slug, created_at
       FROM tags
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${p.order}
      LIMIT ${p.limit} OFFSET ${p.offset}`,
    params,
  );
  const totalRow = await queryOne<{ count: string }>(`SELECT COUNT(*)::int AS count FROM tags WHERE ${whereSql}`, params);
  return { rows, total: Number(totalRow?.count ?? 0) };
}

/** PUBLIK — seluruh tag aktif, untuk filter katalog pra-login. */
export async function publicListTags(): Promise<TagRow[]> {
  return query<TagRow>(`SELECT id, nama, slug, created_at FROM tags WHERE deleted_at IS NULL ORDER BY nama ASC`);
}

export async function detailTag(id: string): Promise<TagRow | null> {
  return queryOne<TagRow>(`SELECT id, nama, slug, created_at FROM tags WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

export async function tagBySlug(slug: string): Promise<TagRow | null> {
  return queryOne<TagRow>(`SELECT id, nama, slug, created_at FROM tags WHERE slug = $1 AND deleted_at IS NULL`, [slug]);
}

export async function insertTag(data: { nama: string; slug: string }): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(`INSERT INTO tags (nama, slug) VALUES ($1,$2) RETURNING id`, [
    data.nama,
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
