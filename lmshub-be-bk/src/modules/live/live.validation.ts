import { z } from 'zod';

export const createLiveSessionSchema = z
  .object({
    course_id: z.string().uuid().optional(),
    cohort_id: z.string().uuid().optional(),
    judul: z.string().min(2).max(200),
    deskripsi: z.string().max(2000).optional(),
    penyedia: z.enum(['zoom', 'bbb', 'meet']).default('zoom'),
    url_join: z.string().min(3),
    host_user_id: z.string().uuid(),
    waktu_mulai: z.string().datetime(),
    waktu_selesai: z.string().datetime(),
    kapasitas_maks: z.number().int().positive().optional(),
    toleransi_terlambat_menit: z.number().int().min(0).default(15),
  })
  .refine((d) => !!d.course_id || !!d.cohort_id, {
    message: 'Either course_id or cohort_id is required',
    path: ['course_id'],
  })
  .refine((d) => new Date(d.waktu_selesai) > new Date(d.waktu_mulai), {
    message: 'waktu_selesai must be later than waktu_mulai',
    path: ['waktu_selesai'],
  });

export const updateLiveSessionSchema = z.object({
  judul: z.string().min(2).max(200).optional(),
  deskripsi: z.string().max(2000).nullable().optional(),
  penyedia: z.enum(['zoom', 'bbb', 'meet']).optional(),
  url_join: z.string().min(3).optional(),
  waktu_mulai: z.string().datetime().optional(),
  waktu_selesai: z.string().datetime().optional(),
  kapasitas_maks: z.number().int().positive().nullable().optional(),
  toleransi_terlambat_menit: z.number().int().min(0).optional(),
});

export const markAttendanceSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum(['hadir', 'terlambat', 'absen']),
  durasi_hadir_menit: z.number().int().min(0).optional(),
});

export const createRecordingSchema = z.object({
  url: z.string().min(3),
  durasi_menit: z.number().int().min(0).optional(),
  ukuran_bytes: z.number().int().min(0).optional(),
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
