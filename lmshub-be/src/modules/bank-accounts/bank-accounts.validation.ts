import { z } from 'zod';

/** Nomor account: digit, spasi, dan tanda hubung saja — bukan angka murni karena
 * sebagian bank menuliskannya bersegment (mis. `123-456-7890`). */
const nomorRekening = z
  .string()
  .min(4)
  .max(40)
  .regex(/^[0-9][0-9\s-]*$/, 'An account number may contain only digits, spaces or hyphens');

export const createBankAccountSchema = z.object({
  bank_name: z.string().min(2).max(80),
  account_number: nomorRekening,
  account_name: z.string().min(2).max(120),
  branch: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  is_primary: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const updateBankAccountSchema = z.object({
  bank_name: z.string().min(2).max(80).optional(),
  account_number: nomorRekening.optional(),
  account_name: z.string().min(2).max(120).optional(),
  branch: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  is_primary: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
