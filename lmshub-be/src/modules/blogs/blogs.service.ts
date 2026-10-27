import { AppError } from '../../core/http/AppError';
import { AuthContext } from '../../core/rbac/types';
import * as repo from './blogs.repository';
import { CreateBlogInput, ListBlogQuery, UpdateBlogInput } from './blogs.validation';

export async function listPublicBlogs(query: ListBlogQuery) {
  return repo.listPublicBlogs({
    page: query.page,
    limit: query.limit,
    search: query.search,
    category: query.category,
  });
}

export async function getPublicBlogDetail(slug: string) {
  const post = await repo.findPublicBlogBySlug(slug);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }
  return post;
}

export async function listCategories() {
  return repo.listCategories();
}

export async function listAdminBlogs(query: ListBlogQuery) {
  return repo.listAdminBlogs({
    page: query.page,
    limit: query.limit,
    search: query.search,
    category: query.category,
    status: query.status,
  });
}

export async function getAdminBlogDetail(id: string) {
  const post = await repo.findBlogById(id);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }
  return post;
}

export async function createAdminBlog(actor: AuthContext, input: CreateBlogInput) {
  const exists = await repo.slugExists(input.slug);
  if (exists) {
    throw AppError.conflict('A blog post with this slug already exists', 'blog.slug_exists');
  }

  const publishedAt = input.status === 'published' ? (input.published_at || new Date().toISOString()) : null;

  return repo.insertBlog({
    title: input.title,
    slug: input.slug,
    summary: input.summary ?? null,
    content: input.content,
    cover_image_url: input.cover_image_url ?? null,
    author_id: actor.userId,
    author_name: input.author_name || 'NFSI Faculty / Admin',
    category: input.category || 'General',
    tags: input.tags || [],
    status: input.status || 'draft',
    published_at: publishedAt,
  });
}

export async function updateAdminBlog(id: string, input: UpdateBlogInput) {
  const post = await repo.findBlogById(id);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }

  if (input.slug && input.slug !== post.slug) {
    const exists = await repo.slugExists(input.slug, id);
    if (exists) {
      throw AppError.conflict('A blog post with this slug already exists', 'blog.slug_exists');
    }
  }

  const fields: Record<string, unknown> = {};
  if (input.title !== undefined) fields.title = input.title;
  if (input.slug !== undefined) fields.slug = input.slug;
  if (input.summary !== undefined) fields.summary = input.summary;
  if (input.content !== undefined) fields.content = input.content;
  if (input.cover_image_url !== undefined) fields.cover_image_url = input.cover_image_url;
  if (input.author_name !== undefined) fields.author_name = input.author_name;
  if (input.category !== undefined) fields.category = input.category;
  if (input.tags !== undefined) fields.tags = JSON.stringify(input.tags);
  if (input.status !== undefined) {
    fields.status = input.status;
    if (input.status === 'published' && !post.published_at) {
      fields.published_at = input.published_at || new Date().toISOString();
    }
  }
  if (input.published_at !== undefined) fields.published_at = input.published_at;

  await repo.updateBlog(id, fields);
  return repo.findBlogById(id);
}

export async function deleteAdminBlog(id: string) {
  const post = await repo.findBlogById(id);
  if (!post) {
    throw AppError.notFound('Blog post not found', 'blog.not_found');
  }
  await repo.softDeleteBlog(id);
}
