import { z } from 'zod';

export const createLiveSessionSchema = z
  .object({
    course_id: z.string().uuid().optional(),
    cohort_id: z.string().uuid().optional(),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    provider: z.enum(['zoom', 'bbb', 'meet']).default('zoom'),
    url_join: z.string().min(3),
    host_user_id: z.string().uuid(),
    start_time: z.string().datetime(),
    end_time: z.string().datetime(),
    kapasitas_maks: z.number().int().positive().optional(),
    toleransi_terlambat_menit: z.number().int().min(0).default(15),
  })
  .refine((d) => !!d.course_id || !!d.cohort_id, {
    message: 'Either course_id or cohort_id is required',
    path: ['course_id'],
  })
  .refine((d) => new Date(d.end_time) > new Date(d.start_time), {
    message: 'end_time must be later than start_time',
    path: ['end_time'],
  });

export const updateLiveSessionSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  provider: z.enum(['zoom', 'bbb', 'meet']).optional(),
  url_join: z.string().min(3).optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  kapasitas_maks: z.number().int().positive().nullable().optional(),
  toleransi_terlambat_menit: z.number().int().min(0).optional(),
});

export const markAttendanceSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(['present', 'late', 'absent']),
  durasi_hadir_menit: z.number().int().min(0).optional(),
});

export const createRecordingSchema = z.object({
  url: z.string().min(3),
  duration_minutes: z.number().int().min(0).optional(),
  size_bytes: z.number().int().min(0).optional(),
  retensi_hingga: z.string().datetime().optional(),
});

export const publishAsLessonSchema = z.object({
  lesson_id: z.string().uuid(),
});

export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>;
export type UpdateLiveSessionInput = z.infer<typeof updateLiveSessionSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type CreateRecordingInput = z.infer<typeof createRecordingSchema>;
export type PublishAsLessonInput = z.infer<typeof publishAsLessonSchema>;
