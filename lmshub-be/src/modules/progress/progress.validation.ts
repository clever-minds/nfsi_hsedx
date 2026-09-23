import { z } from 'zod';

export const lessonProgressStatusEnum = z.enum(['belum', 'sedang', 'selesai']);

export const updateLessonProgressSchema = z.object({
  status: lessonProgressStatusEnum.optional(),
  posisi_detik: z.number().int().min(0).optional(),
});

export const createNoteSchema = z.object({
  isi: z.string().min(1).max(5000),
  timestamp_detik: z.number().int().min(0).nullable().optional(),
});

export const updateNoteSchema = z.object({
  isi: z.string().min(1).max(5000).optional(),
  timestamp_detik: z.number().int().min(0).nullable().optional(),
});

export const createBookmarkSchema = z.object({
  posisi_detik: z.number().int().min(0).nullable().optional(),
  catatan: z.string().max(200).nullable().optional(),
});

export type UpdateLessonProgressInput = z.infer<typeof updateLessonProgressSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
