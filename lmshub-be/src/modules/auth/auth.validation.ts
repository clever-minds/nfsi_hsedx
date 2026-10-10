import { z } from 'zod';

export const registerSchema = z
  .object({
    name_lengkap: z.string().min(2).max(150),
    email: z.string().email().optional(),
    number_wa: z.string().min(6).max(20).optional(),
    password: z.string().min(8).max(100),
    // pendaftaran affiliate: kode referral pengundang (opsional)
    referral: z.string().optional(),
    // channel pendaftaran: student (default) atau affiliate (need verifikasi admin)
    sebagai: z.enum(['student', 'affiliate']).default('student'),
  })
  .refine((d) => d.email || d.number_wa, {
    message: 'Enter an email address or a WhatsApp number',
    path: ['email'],
  });

export const loginSchema = z.object({
  identifier: z.string().min(3), // email atau number WA
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
