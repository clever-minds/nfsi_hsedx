import { z } from 'zod';

// ── financial_entries ────────────────────────────────────────────────────
export const createFinancialEntrySchema = z.object({
  jenis: z.enum(['pemasukan', 'pengeluaran']),
  kategori_id: z.string().uuid(),
  course_id: z.string().uuid().optional(),
  nominal: z.number().nonnegative(),
  bukti: z.string().max(500).optional(),
  tanggal: z.string().date(),
  deskripsi: z.string().max(1000).optional(),
});

// ── instructor_payouts ───────────────────────────────────────────────────
export const approvePayoutSchema = z.object({
  aksi: z.enum(['approve', 'reject']),
  catatan_approval: z.string().max(1000).optional(),
});

// ── reviews ──────────────────────────────────────────────────────────────
export const createReviewSchema = z.object({
  enrollment_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  ulasan: z.string().max(2000).optional(),
});

export type CreateFinancialEntryInput = z.infer<typeof createFinancialEntrySchema>;
export type ApprovePayoutInput = z.infer<typeof approvePayoutSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
