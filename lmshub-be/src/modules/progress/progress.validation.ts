import { z } from 'zod';

export const lessonProgressStatusEnum = z.enum(['not_started', 'in_progress', 'completed']);

export const updateLessonProgressSchema = z.object({
  status: lessonProgressStatusEnum.optional(),
  position_seconds: z.number().int().min(0).optional(),
});

export const createNoteSchema = z.object({
  content: z.string().min(1).max(5000),
  timestamp_detik: z.number().int().min(0).nullable().optional(),
});

export const updateNoteSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  timestamp_detik: z.number().int().min(0).nullable().optional(),
});

export const createBookmarkSchema = z.object({
  position_seconds: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(200).nullable().optional(),
});

export type UpdateLessonProgressInput = z.infer<typeof updateLessonProgressSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
