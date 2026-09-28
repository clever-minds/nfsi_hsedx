import { z } from 'zod';

export const mediaTipeFileEnum = z.enum(['video', 'gambar', 'dokumen', 'audio']);
export const transcodeStatusEnum = z.enum(['menunggu', 'memproses', 'selesai', 'gagal']);

export const createMediaSchema = z.object({
  tipe_file: mediaTipeFileEnum,
  nama_file: z.string().min(1).max(255),
  path_object_storage: z.string().min(1),
  mime_type: z.string().max(100).optional(),
  ukuran_bytes: z.number().int().min(0).optional(),
  checksum: z.string().max(255).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const updateStatusSchema = z.object({
  status_transcode: transcodeStatusEnum,
  hls_manifest_url: z.string().url().optional(),
  durasi_detik: z.number().int().min(0).optional(),
});

export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
