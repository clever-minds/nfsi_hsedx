import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  ikon: z.string().max(100).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  ikon: z.string().max(100).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const createTagSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().min(2).max(80).optional(),
});

export const updateTagSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  slug: z.string().min(2).max(80).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
