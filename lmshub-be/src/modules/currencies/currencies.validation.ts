import { z } from 'zod';

/** ISO 4217 is always three letters; stored uppercase so lookups never depend on case. */
const kode = z
  .string()
  .trim()
  .length(3, 'Currency code must be exactly three letters')
  .regex(/^[A-Za-z]{3}$/, 'Currency code must be letters only')
  .transform((v) => v.toUpperCase());

const body = z.object({
  kode,
  nama: z.string().trim().min(1).max(80),
  simbol: z.string().trim().max(8).default(''),
  /**
   * How many of this currency equal one unit of the base currency.
   * Rejecting zero and negatives here rather than at the database keeps the
   * error a readable field message instead of a constraint violation.
   */
  rate: z.coerce.number().positive('Rate must be greater than zero'),
  desimal: z.coerce.number().int().min(0).max(4).default(2),
  is_aktif: z.boolean().default(true),
  urutan: z.coerce.number().int().min(0).default(0),
});

// Skema datar, memvalidasi `req.body` langsung — sama seperti modul lain.
export const createCurrencySchema = body;
export const updateCurrencySchema = body.partial().omit({ kode: true });

export type CreateCurrencyInput = z.infer<typeof body>;
export type UpdateCurrencyInput = Partial<Omit<CreateCurrencyInput, 'kode'>>;
