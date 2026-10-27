import { query, queryOne } from '../../core/db/pool';

export interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  cover_image_url: string | null;
  author_id: string | null;
  author_name: string | null;
  category: string;
  tags: string[];
  status: string;
  published_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export async function listPublicBlogs(params: {
  page: number;
  limit: number;
  search?: string;
  category?: string;
}): Promise<{ rows: BlogPostRow[]; total: number }> {
  const where: string[] = ["deleted_at IS NULL AND status = 'published'"];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    where.push(`(title ILIKE $${values.length} OR summary ILIKE $${values.length})`);
  }

  if (params.category && params.category !== 'All') {
    values.push(params.category);
    where.push(`category = $${values.length}`);
  }

  const whereClause = where.join(' AND ');
  const countRow = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM blog_posts WHERE ${whereClause}`,
    values,
  );
  const total = Number(countRow?.total ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const rows = await query<BlogPostRow>(
    `SELECT id, title, slug, summary, content, cover_image_url, author_id, author_name, category, tags, status, published_at, view_count, created_at, updated_at
       FROM blog_posts
      WHERE ${whereClause}
      ORDER BY COALESCE(published_at, created_at) DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows, total };
}

export async function findPublicBlogBySlug(slug: string): Promise<BlogPostRow | null> {
  const row = await queryOne<BlogPostRow>(
    `SELECT id, title, slug, summary, content, cover_image_url, author_id, author_name, category, tags, status, published_at, view_count, created_at, updated_at
       FROM blog_posts
      WHERE slug = $1 AND deleted_at IS NULL AND status = 'published'`,
    [slug],
  );

  if (row) {
    // Increment view_count asynchronously
    query(`UPDATE blog_posts SET view_count = view_count + 1 WHERE id = $1`, [row.id]).catch(() => {});
  }

  return row;
}

export async function listAdminBlogs(params: {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  status?: string;
}): Promise<{ rows: BlogPostRow[]; total: number }> {
  const where: string[] = ['deleted_at IS NULL'];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    where.push(`(title ILIKE $${values.length} OR slug ILIKE $${values.length} OR summary ILIKE $${values.length})`);
  }

  if (params.category && params.category !== 'All') {
    values.push(params.category);
    where.push(`category = $${values.length}`);
  }

  if (params.status) {
    values.push(params.status);
    where.push(`status = $${values.length}`);
  }

  const whereClause = where.join(' AND ');
  const countRow = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM blog_posts WHERE ${whereClause}`,
    values,
  );
  const total = Number(countRow?.total ?? 0);

  const offset = (params.page - 1) * params.limit;
  values.push(params.limit, offset);

  const rows = await query<BlogPostRow>(
    `SELECT id, title, slug, summary, content, cover_image_url, author_id, author_name, category, tags, status, published_at, view_count, created_at, updated_at
       FROM blog_posts
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return { rows, total };
}

export async function findBlogById(id: string): Promise<BlogPostRow | null> {
  return queryOne<BlogPostRow>(
    `SELECT id, title, slug, summary, content, cover_image_url, author_id, author_name, category, tags, status, published_at, view_count, created_at, updated_at
       FROM blog_posts
      WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

export async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const res = excludeId
    ? await queryOne<{ ok: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM blog_posts WHERE slug = $1 AND id != $2 AND deleted_at IS NULL) AS ok`,
        [slug, excludeId],
      )
    : await queryOne<{ ok: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM blog_posts WHERE slug = $1 AND deleted_at IS NULL) AS ok`,
        [slug],
      );
  return res?.ok ?? false;
}

export async function insertBlog(data: {
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  cover_image_url: string | null;
  author_id: string | null;
  author_name: string | null;
  category: string;
  tags: string[];
  status: string;
  published_at: string | null;
}): Promise<BlogPostRow> {
  const row = await queryOne<BlogPostRow>(
    `INSERT INTO blog_posts (title, slug, summary, content, cover_image_url, author_id, author_name, category, tags, status, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, title, slug, summary, content, cover_image_url, author_id, author_name, category, tags, status, published_at, view_count, created_at, updated_at`,
    [
      data.title,
      data.slug,
      data.summary,
      data.content,
      data.cover_image_url,
      data.author_id,
      data.author_name,
      data.category,
      JSON.stringify(data.tags || []),
      data.status,
      data.published_at,
    ],
  );
  return row!;
}

export async function updateBlog(id: string, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await query(`UPDATE blog_posts SET ${set} WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

export async function softDeleteBlog(id: string): Promise<void> {
  await query(`UPDATE blog_posts SET deleted_at = now() WHERE id = $1`, [id]);
}

export async function listCategories(): Promise<string[]> {
  const rows = await query<{ category: string }>(
    `SELECT DISTINCT category FROM blog_posts WHERE deleted_at IS NULL AND category IS NOT NULL ORDER BY category ASC`,
  );
  return rows.map((r) => r.category);
}
