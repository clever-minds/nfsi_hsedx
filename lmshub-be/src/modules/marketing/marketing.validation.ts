import { z } from 'zod';

export const registerAffiliateSchema = z.object({
  category_kode: z.string().min(2).max(50),
  bank_name: z.string().max(60).optional(),
  no_account: z.string().max(40).optional(),
  account_owner_name: z.string().max(150).optional(),
  parent_agent_user_id: z.string().uuid().optional(),
});

export const verifyAffiliateSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
});

export const targetOverrideSchema = z.object({
  target: z.number().nonnegative(),
});

export const createReferralLinkSchema = z.object({
  target_url: z.string().min(3).max(2000),
  title: z.string().max(150).optional(),
  expires_at: z.string().datetime().optional(),
});

export const createLeadSchema = z.object({
  lead_name: z.string().min(2).max(150),
  kontak: z.string().min(3).max(120),
  interested_course_id: z.string().uuid().optional(),
  source_referral_link_id: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

export const moveStageSchema = z
  .object({
    stage: z.enum(['lead', 'prospect', 'closing']),
    notes: z.string().max(500).optional(),
    // wajib bila stage='closing' — hasil POST /orders/manual (09-transaction-payment)
    order_id: z.string().uuid().optional(),
  })
  .refine((d) => d.stage !== 'closing' || !!d.order_id, {
    message: 'order_id is required for the closing stage',
    path: ['order_id'],
  });

/** FINANSIAL — approval Direktur wajib. */
export const approveCommissionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(500).optional(),
});

/** FINANSIAL — pencairan commission. */
export const disburseCommissionSchema = z.object({
  disbursement_proof: z.string().min(3).max(500),
  method_pencairan: z.string().max(30).optional(),
  notes: z.string().max(500).optional(),
});

export type RegisterAffiliateInput = z.infer<typeof registerAffiliateSchema>;
export type VerifyAffiliateInput = z.infer<typeof verifyAffiliateSchema>;
export type TargetOverrideInput = z.infer<typeof targetOverrideSchema>;
export type CreateReferralLinkInput = z.infer<typeof createReferralLinkSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type MoveStageInput = z.infer<typeof moveStageSchema>;
export type ApproveCommissionInput = z.infer<typeof approveCommissionSchema>;
export type DisburseCommissionInput = z.infer<typeof disburseCommissionSchema>;
