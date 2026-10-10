import { z } from 'zod';

// ── financial_entries ────────────────────────────────────────────────────
export const createFinancialEntrySchema = z.object({
  type: z.enum(['income', 'expense']),
  category_id: z.string().uuid(),
  course_id: z.string().uuid().optional(),
  amount: z.number().nonnegative(),
  proof: z.string().max(500).optional(),
  date: z.string().date(),
  description: z.string().max(1000).optional(),
});

// ── instructor_payouts ───────────────────────────────────────────────────
export const approvePayoutSchema = z.object({
  action: z.enum(['approve', 'reject']),
  notes_approval: z.string().max(1000).optional(),
});

// ── reviews ──────────────────────────────────────────────────────────────
export const createReviewSchema = z.object({
  enrollment_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional(),
});

export type CreateFinancialEntryInput = z.infer<typeof createFinancialEntrySchema>;
export type ApprovePayoutInput = z.infer<typeof approvePayoutSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
