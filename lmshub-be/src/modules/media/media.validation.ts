import { z } from 'zod';

export const mediaTipeFileEnum = z.enum(['video', 'image', 'document', 'audio']);
export const transcodeStatusEnum = z.enum(['pending', 'memproses', 'completed', 'failed']);

export const createMediaSchema = z.object({
  file_type: mediaTipeFileEnum,
  file_name: z.string().min(1).max(255),
  path_object_storage: z.string().min(1),
  mime_type: z.string().max(100).optional(),
  size_bytes: z.number().int().min(0).optional(),
  checksum: z.string().max(255).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const updateStatusSchema = z.object({
  status_transcode: transcodeStatusEnum,
  hls_manifest_url: z.string().url().optional(),
  duration_seconds: z.number().int().min(0).optional(),
});

export type CreateMediaInput = z.infer<typeof createMediaSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
