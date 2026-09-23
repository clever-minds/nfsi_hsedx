import { z } from 'zod';

export const lessonTipeEnum = z.enum(['video', 'teks', 'pdf', 'kuis', 'tugas', 'live_class', 'scorm', 'embed']);
export const kontenTipeEnum = z.enum(['video', 'teks', 'pdf', 'embed', 'scorm']);

// ── Sections ─────────────────────────────────────────
export const createSectionSchema = z.object({
  judul: z.string().min(2).max(200),
  urutan: z.number().int().min(0).optional(),
  deskripsi: z.string().max(2000).optional(),
});

export const updateSectionSchema = z.object({
  judul: z.string().min(2).max(200).optional(),
  urutan: z.number().int().min(0).optional(),
  deskripsi: z.string().max(2000).nullable().optional(),
});

export const reorderSectionsSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), urutan: z.number().int().min(0) })).min(1),
});

// ── Lessons ──────────────────────────────────────────
export const createLessonSchema = z.object({
  judul: z.string().min(2).max(200),
  tipe: lessonTipeEnum.default('video'),
  urutan: z.number().int().min(0).optional(),
  durasi_menit: z.number().int().min(0).optional(),
  gratis_preview: z.boolean().optional(),
  drip_release_at: z.string().datetime().nullable().optional(),
  wajib_selesai: z.boolean().optional(),
});

export const updateLessonSchema = z.object({
  judul: z.string().min(2).max(200).optional(),
  tipe: lessonTipeEnum.optional(),
  urutan: z.number().int().min(0).optional(),
  durasi_menit: z.number().int().min(0).nullable().optional(),
  gratis_preview: z.boolean().optional(),
  drip_release_at: z.string().datetime().nullable().optional(),
  wajib_selesai: z.boolean().optional(),
  section_id: z.string().uuid().optional(),
});

export const reorderLessonsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        urutan: z.number().int().min(0),
        section_id: z.string().uuid().optional(),
      }),
    )
    .min(1),
});

// ── Lesson Contents ──────────────────────────────────
export const createContentSchema = z.object({
  tipe: kontenTipeEnum,
  urutan: z.number().int().min(0).optional(),
  body: z.string().optional(),
  media_asset_id: z.string().uuid().optional(),
  url: z.string().url().optional(),
  scorm_manifest_url: z.string().url().optional(),
  durasi_detik: z.number().int().min(0).optional(),
});

export const updateContentSchema = z.object({
  tipe: kontenTipeEnum.optional(),
  urutan: z.number().int().min(0).optional(),
  body: z.string().nullable().optional(),
  media_asset_id: z.string().uuid().nullable().optional(),
  url: z.string().url().nullable().optional(),
  scorm_manifest_url: z.string().url().nullable().optional(),
  durasi_detik: z.number().int().min(0).nullable().optional(),
});

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type ReorderLessonsInput = z.infer<typeof reorderLessonsSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
