import { z } from 'zod';

export const registerAffiliateSchema = z.object({
  category_kode: z.string().min(2).max(50),
  nama_bank: z.string().max(60).optional(),
  no_rekening: z.string().max(40).optional(),
  nama_pemilik_rekening: z.string().max(150).optional(),
  parent_agen_user_id: z.string().uuid().optional(),
});

export const verifyAffiliateSchema = z.object({
  aksi: z.enum(['approve', 'reject']),
  alasan: z.string().max(500).optional(),
});

export const targetOverrideSchema = z.object({
  target: z.number().nonnegative(),
});

export const createReferralLinkSchema = z.object({
  url_target: z.string().min(3).max(2000),
  judul: z.string().max(150).optional(),
  expires_at: z.string().datetime().optional(),
});

export const createLeadSchema = z.object({
  nama_calon: z.string().min(2).max(150),
  kontak: z.string().min(3).max(120),
  minat_course_id: z.string().uuid().optional(),
  sumber_referral_link_id: z.string().uuid().optional(),
  catatan: z.string().max(1000).optional(),
});

export const moveStageSchema = z
  .object({
    tahap: z.enum(['lead', 'prospek', 'closing']),
    catatan: z.string().max(500).optional(),
    // wajib bila tahap='closing' — hasil POST /orders/manual (09-transaksi-pembayaran)
    order_id: z.string().uuid().optional(),
  })
  .refine((d) => d.tahap !== 'closing' || !!d.order_id, {
    message: 'order_id is required for the closing stage',
    path: ['order_id'],
  });

/** FINANSIAL — approval Direktur wajib. */
export const approveCommissionSchema = z.object({
  aksi: z.enum(['approve', 'reject']),
  catatan: z.string().max(500).optional(),
});

/** FINANSIAL — pencairan komisi. */
export const disburseCommissionSchema = z.object({
  bukti_cair: z.string().min(3).max(500),
  metode_pencairan: z.string().max(30).optional(),
  catatan: z.string().max(500).optional(),
});

export type RegisterAffiliateInput = z.infer<typeof registerAffiliateSchema>;
export type VerifyAffiliateInput = z.infer<typeof verifyAffiliateSchema>;
export type TargetOverrideInput = z.infer<typeof targetOverrideSchema>;
export type CreateReferralLinkInput = z.infer<typeof createReferralLinkSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
export type ApproveCommissionInput = z.infer<typeof approveCommissionSchema>;
export type DisburseCommissionInput = z.infer<typeof disburseCommissionSchema>;
