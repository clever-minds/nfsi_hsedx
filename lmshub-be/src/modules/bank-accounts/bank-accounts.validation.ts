import { z } from 'zod';

/** Nomor rekening: digit, spasi, dan tanda hubung saja — bukan angka murni karena
 * sebagian bank menuliskannya bersegmen (mis. `123-456-7890`). */
const nomorRekening = z
  .string()
  .min(4)
  .max(40)
  .regex(/^[0-9][0-9\s-]*$/, 'An account number may contain only digits, spaces or hyphens');

export const createBankAccountSchema = z.object({
  nama_bank: z.string().min(2).max(80),
  nomor_rekening: nomorRekening,
  atas_nama: z.string().min(2).max(120),
  cabang: z.string().max(120).nullable().optional(),
  catatan: z.string().max(500).nullable().optional(),
  is_aktif: z.boolean().optional(),
  is_utama: z.boolean().optional(),
  urutan: z.number().int().min(0).max(9999).optional(),
});

export const updateBankAccountSchema = z.object({
  nama_bank: z.string().min(2).max(80).optional(),
  nomor_rekening: nomorRekening.optional(),
  atas_nama: z.string().min(2).max(120).optional(),
  cabang: z.string().max(120).nullable().optional(),
  catatan: z.string().max(500).nullable().optional(),
  is_aktif: z.boolean().optional(),
  is_utama: z.boolean().optional(),
  urutan: z.number().int().min(0).max(9999).optional(),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
