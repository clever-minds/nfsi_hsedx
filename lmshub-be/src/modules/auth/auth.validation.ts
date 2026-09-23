import { z } from 'zod';

export const registerSchema = z
  .object({
    nama_lengkap: z.string().min(2).max(150),
    email: z.string().email().optional(),
    nomor_wa: z.string().min(6).max(20).optional(),
    password: z.string().min(8).max(100),
    // pendaftaran affiliate: kode referral pengundang (opsional)
    referral: z.string().optional(),
    // jalur pendaftaran: siswa (default) atau affiliate (butuh verifikasi admin)
    sebagai: z.enum(['siswa', 'affiliate']).default('siswa'),
  })
  .refine((d) => d.email || d.nomor_wa, {
    message: 'Enter an email address or a WhatsApp number',
    path: ['email'],
  });

export const loginSchema = z.object({
  identifier: z.string().min(3), // email atau nomor WA
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(10),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});

export const googleSchema = z.object({
  id_token: z.string().min(10),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type GoogleInput = z.infer<typeof googleSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
