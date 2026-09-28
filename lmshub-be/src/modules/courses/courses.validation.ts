import { z } from 'zod';

export const courseLevelEnum = z.enum(['pemula', 'menengah', 'mahir']);

export const createCourseSchema = z.object({
  judul: z.string().min(3).max(200),
  slug: z.string().min(3).max(220).optional(),
  ringkasan: z.string().max(500).optional(),
  deskripsi: z.string().optional(),
  category_id: z.string().uuid(),
  // Hanya admin/super yang boleh mengisi ini untuk menugaskan kursus ke instruktur lain.
  instructor_id: z.string().uuid().optional(),
  level: courseLevelEnum.default('pemula'),
  harga: z.number().min(0).default(0),
  harga_coret: z.number().min(0).optional(),
  thumbnail_media_id: z.string().uuid().optional(),
  promo_video_media_id: z.string().uuid().optional(),
  bahasa: z.string().min(2).max(10).default('id'),
  meta: z.record(z.unknown()).optional(),
});

export const updateCourseSchema = z.object({
  judul: z.string().min(3).max(200).optional(),
  slug: z.string().min(3).max(220).optional(),
  ringkasan: z.string().max(500).nullable().optional(),
  deskripsi: z.string().nullable().optional(),
  category_id: z.string().uuid().optional(),
  level: courseLevelEnum.optional(),
  harga: z.number().min(0).optional(),
  harga_coret: z.number().min(0).nullable().optional(),
  thumbnail_media_id: z.string().uuid().nullable().optional(),
  promo_video_media_id: z.string().uuid().nullable().optional(),
  bahasa: z.string().min(2).max(10).optional(),
  meta: z.record(z.unknown()).nullable().optional(),
});

export const publishCourseSchema = z.object({
  catatan: z.string().max(500).optional(),
});

export const archiveCourseSchema = z.object({
  alasan: z.string().max(500).optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type PublishCourseInput = z.infer<typeof publishCourseSchema>;
export type ArchiveCourseInput = z.infer<typeof archiveCourseSchema>;
