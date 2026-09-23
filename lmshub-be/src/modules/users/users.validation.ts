import { z } from 'zod';

export const createUserSchema = z
  .object({
    nama_lengkap: z.string().min(2).max(150),
    email: z.string().email().optional(),
    nomor_wa: z.string().min(6).max(20).optional(),
    password: z.string().min(8).max(100),
    role_kode: z.string().min(2),
    status: z.enum(['pending', 'active']).default('active'),
  })
  .refine((d) => d.email || d.nomor_wa, { message: 'Enter an email address or a WhatsApp number', path: ['email'] });

export const updateUserSchema = z.object({
  nama_lengkap: z.string().min(2).max(150).optional(),
  email: z.string().email().nullable().optional(),
  nomor_wa: z.string().min(6).max(20).nullable().optional(),
  status: z.enum(['pending', 'active', 'inactive']).optional(),
  role_kode: z.string().optional(),
});

export const setPermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      module: z.string(),
      action: z.enum(['view', 'create', 'update', 'delete']),
      effect: z.enum(['allow', 'deny']).default('allow'),
    }),
  ),
});

export const verifySchema = z.object({
  aksi: z.enum(['approve', 'reject']),
  alasan: z.string().max(500).optional(),
});

export const addRoleSchema = z.object({
  role_kode: z.string().min(2),
  alasan: z.string().max(500).optional(),
});

// ── Self-service (profil & password sendiri) ──────────────────
export const updateMeSchema = z.object({
  nama_lengkap: z.string().min(2).max(150).optional(),
  nomor_wa: z.string().min(6).max(20).nullable().optional(),
});

export const changeMyPasswordSchema = z.object({
  password_lama: z.string().min(1, 'The current password is required'),
  password_baru: z.string().min(8).max(100),
});

// Foto profil dikirim sebagai base64 (payload JSON, limit body 2mb → gambar efektif ±1.5MB).
export const uploadMyPhotoSchema = z.object({
  data_base64: z.string().min(1, 'Image data is required'),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SetPermissionsInput = z.infer<typeof setPermissionsSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type ChangeMyPasswordInput = z.infer<typeof changeMyPasswordSchema>;
export type UploadMyPhotoInput = z.infer<typeof uploadMyPhotoSchema>;
