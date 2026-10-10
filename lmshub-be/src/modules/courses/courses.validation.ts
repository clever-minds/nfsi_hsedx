import { z } from 'zod';

export const courseLevelEnum = z.enum(['beginner', 'intermediate', 'advanced']);

export const createCourseSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().min(3).max(220).optional(),
  summary: z.string().max(500).optional(),
  description: z.string().optional(),
  category_id: z.string().uuid(),
  // Hanya admin/super yang boleh mengisi ini untuk menugaskan course to instructor lain.
  instructor_id: z.string().uuid().optional(),
  level: courseLevelEnum.default('beginner'),
  price: z.number().min(0).default(0),
  strike_price: z.number().min(0).optional(),
  thumbnail_media_id: z.string().uuid().optional(),
  promo_video_media_id: z.string().uuid().optional(),
  language: z.string().min(2).max(10).default('id'),
  meta: z.record(z.unknown()).optional(),
});

export const updateCourseSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  slug: z.string().min(3).max(220).optional(),
  summary: z.string().max(500).nullable().optional(),
  description: z.string().nullable().optional(),
  category_id: z.string().uuid().optional(),
  level: courseLevelEnum.optional(),
  price: z.number().min(0).optional(),
  strike_price: z.number().min(0).nullable().optional(),
  thumbnail_media_id: z.string().uuid().nullable().optional(),
  promo_video_media_id: z.string().uuid().nullable().optional(),
  language: z.string().min(2).max(10).optional(),
  meta: z.record(z.unknown()).nullable().optional(),
});

/** Aturan kelulusan — disimpan terpisah from data course supaya no memicu review ulang. */
export const completionRulesSchema = z.object({
  final_exam_quiz_id: z.string().uuid().nullable().optional(),
  allow_restart: z.boolean().optional(),
});

export const publishCourseSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const archiveCourseSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CompletionRulesInput = z.infer<typeof completionRulesSchema>;
export type PublishCourseInput = z.infer<typeof publishCourseSchema>;
export type ArchiveCourseInput = z.infer<typeof archiveCourseSchema>;
