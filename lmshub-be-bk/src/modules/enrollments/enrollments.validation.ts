import { z } from 'zod';

export const enrollmentSumberEnum = z.enum(['beli', 'assign', 'bundle', 'path']);
export const enrollmentStatusEnum = z.enum(['terdaftar', 'aktif', 'selesai', 'kedaluwarsa', 'batal']);

export const createEnrollmentSchema = z.object({
  user_id: z.string().uuid(),
  course_id: z.string().uuid(),
  cohort_id: z.string().uuid().nullable().optional(),
  sumber: enrollmentSumberEnum,
  order_item_id: z.string().uuid().nullable().optional(),
  akses_kedaluwarsa_at: z.string().datetime().nullable().optional(),
  catatan: z.string().max(500).nullable().optional(),
});

export const transferEnrollmentSchema = z.object({
  cohort_id: z.string().uuid().nullable(),
  catatan: z.string().max(500).optional(),
});

export const revokeEnrollmentSchema = z.object({
  alasan: z.string().min(3).max(500),
});

export const bulkImportSchema = z.object({
  course_id: z.string().uuid(),
  cohort_id: z.string().uuid().nullable().optional(),
  user_ids: z.array(z.string().uuid()).min(1).max(1000),
  alasan: z.string().max(500).optional(),
});

export const createCohortSchema = z.object({
  nama: z.string().min(2).max(150),
  tanggal_mulai: z.string().datetime(),
  tanggal_selesai: z.string().datetime().nullable().optional(),
  kuota_maksimal: z.number().int().positive().nullable().optional(),
});

export const updateCohortSchema = z.object({
  nama: z.string().min(2).max(150).optional(),
  tanggal_mulai: z.string().datetime().optional(),
  tanggal_selesai: z.string().datetime().nullable().optional(),
  kuota_maksimal: z.number().int().positive().nullable().optional(),
  status: z.enum(['direncanakan', 'berjalan', 'selesai', 'dibatalkan']).optional(),
});

export const openSlotSchema = z.object({
  tambahan_slot: z.number().int().positive().default(1),
});

export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;
export type TransferEnrollmentInput = z.infer<typeof transferEnrollmentSchema>;
export type RevokeEnrollmentInput = z.infer<typeof revokeEnrollmentSchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type CreateCohortInput = z.infer<typeof createCohortSchema>;
export type UpdateCohortInput = z.infer<typeof updateCohortSchema>;
export type OpenSlotInput = z.infer<typeof openSlotSchema>;
