import { z } from 'zod';

export const blogStatusEnum = z.enum(['draft', 'published', 'archived']);

export const createBlogSchema = z.object({
  title: z.string().min(2).max(250),
  slug: z.string().min(2).max(250).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  summary: z.string().max(1000).nullable().optional(),
  content: z.string().min(1, 'Blog content cannot be empty'),
  cover_image_url: z.string().nullable().optional(),
  category: z.string().max(100).default('General'),
  tags: z.array(z.string()).default([]),
  status: blogStatusEnum.default('draft'),
  author_name: z.string().max(150).nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
});

export const updateBlogSchema = z.object({
  title: z.string().min(2).max(250).optional(),
  slug: z.string().min(2).max(250).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens').optional(),
  summary: z.string().max(1000).nullable().optional(),
  content: z.string().min(1).optional(),
  cover_image_url: z.string().nullable().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  status: blogStatusEnum.optional(),
  author_name: z.string().max(150).nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
});

export const listBlogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().optional(),
  category: z.string().optional(),
  status: blogStatusEnum.optional(),
});

export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;
export type ListBlogQuery = z.infer<typeof listBlogQuerySchema>;
