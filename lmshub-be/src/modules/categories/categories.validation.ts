import { z } from 'zod';

export const createCategorySchema = z.object({
  nama: z.string().min(2).max(100),
  slug: z.string().min(2).max(120).optional(),
  deskripsi: z.string().max(2000).optional(),
  ikon: z.string().max(100).optional(),
  urutan: z.number().int().min(0).optional(),
  is_aktif: z.boolean().optional(),
});

export const updateCategorySchema = z.object({
  nama: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(120).optional(),
  deskripsi: z.string().max(2000).nullable().optional(),
  ikon: z.string().max(100).nullable().optional(),
  urutan: z.number().int().min(0).optional(),
  is_aktif: z.boolean().optional(),
});

export const createTagSchema = z.object({
  nama: z.string().min(2).max(60),
  slug: z.string().min(2).max(80).optional(),
});

export const updateTagSchema = z.object({
  nama: z.string().min(2).max(60).optional(),
  slug: z.string().min(2).max(80).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
