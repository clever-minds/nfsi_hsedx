import { z } from 'zod';

export const lessonTipeEnum = z.enum(['video', 'text', 'pdf', 'quiz', 'assignment', 'live_class', 'scorm', 'embed']);
export const kontenTipeEnum = z.enum(['video', 'text', 'pdf', 'embed', 'scorm']);

/**
 * Alamat isi pelajaran: URL http(s) penuh, ATAU path relatif terhadap akar
 * situs seperti `/uploads/pelajaran-1.mp4`.
 *
 * Bentuk relatif harus diterima karena memang sudah dipakai di dua tempat lain:
 * pemutar melewatkannya ke `assetUrl()` yang menempelkan origin API, dan seeder
 * demo menuliskannya langsung ke basis data. Hanya validasi inilah yang dulu
 * menolaknya, sehingga berkas yang diunggah admin ke `uploads/` servernya
 * sendiri tidak bisa dipasang lewat antarmuka — padahal berkas yang sama persis
 * berfungsi bila dimasukkan lewat SQL.
 */
const contentUrl = z
  .string()
  .min(1)
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith('/'), {
    message: 'Must be a full http(s) address or a path beginning with /',
  });

// ── Sections ─────────────────────────────────────────
export const createSectionSchema = z.object({
  title: z.string().min(2).max(200),
  sort_order: z.number().int().min(0).optional(),
  description: z.string().max(2000).optional(),
});

export const updateSectionSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  sort_order: z.number().int().min(0).optional(),
  description: z.string().max(2000).nullable().optional(),
});

export const reorderSectionsSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sort_order: z.number().int().min(0) })).min(1),
});

// ── Lessons ──────────────────────────────────────────
export const createLessonSchema = z.object({
  title: z.string().min(2).max(200),
  tipe: lessonTipeEnum.default('video'),
  sort_order: z.number().int().min(0).optional(),
  duration_minutes: z.number().int().min(0).optional(),
  gratis_preview: z.boolean().optional(),
  drip_release_at: z.string().datetime().nullable().optional(),
  must_complete: z.boolean().optional(),
});

export const updateLessonSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  tipe: lessonTipeEnum.optional(),
  sort_order: z.number().int().min(0).optional(),
  duration_minutes: z.number().int().min(0).nullable().optional(),
  gratis_preview: z.boolean().optional(),
  drip_release_at: z.string().datetime().nullable().optional(),
  must_complete: z.boolean().optional(),
  section_id: z.string().uuid().optional(),
});

export const reorderLessonsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sort_order: z.number().int().min(0),
        section_id: z.string().uuid().optional(),
      }),
    )
    .min(1),
});

// ── Lesson Contents ──────────────────────────────────
export const createContentSchema = z.object({
  tipe: kontenTipeEnum,
  sort_order: z.number().int().min(0).optional(),
  body: z.string().optional(),
  media_asset_id: z.string().uuid().optional(),
  url: contentUrl.optional(),
  scorm_manifest_url: contentUrl.optional(),
  duration_seconds: z.number().int().min(0).optional(),
});

export const updateContentSchema = z.object({
  tipe: kontenTipeEnum.optional(),
  sort_order: z.number().int().min(0).optional(),
  body: z.string().nullable().optional(),
  media_asset_id: z.string().uuid().nullable().optional(),
  url: contentUrl.nullable().optional(),
  scorm_manifest_url: contentUrl.nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
});

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type ReorderLessonsInput = z.infer<typeof reorderLessonsSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
