import { z } from 'zod';

export const couponTipeEnum = z.enum(['percent', 'amount']);

/**
 * Kode dipakai apa adanya by pembeli saat checkout, jadi dibatasi to karakter
 * yang selamat lewat URL, email dan salin-tempel: huruf, angka, garis dan garis
 * bawah. Kolomnya `citext`, sehingga 'HEMAT10' dan 'hemat10' adalah kode yang
 * sama dan no bisa didaftarkan dua kali.
 */
const kode = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphen or underscore only');

const base = {
  discount_type: couponTipeEnum,
  discount_value: z.number().min(0),
  max_quota: z.number().int().positive().nullable().optional(),
  min_purchase: z.number().min(0).nullable().optional(),
  valid_from: z.string().datetime().nullable().optional(),
  valid_until: z.string().datetime().nullable().optional(),
  is_active: z.boolean().optional(),
};

/** Potongan persen di on 100 akan membuat total negatif. */
const percentWithinRange = (d: { discount_type?: string; discount_value?: number }) =>
  d.discount_type !== 'percent' || d.discount_value === undefined || d.discount_value <= 100;

/** Jendela valid yang terbalik membuat kupon no pernah bisa dipakai. */
const windowOrdered = (d: { valid_from?: string | null; valid_until?: string | null }) =>
  !d.valid_from || !d.valid_until || new Date(d.valid_until) > new Date(d.valid_from);

export const createCouponSchema = z
  .object({ kode, ...base })
  .refine(percentWithinRange, { message: 'A percentage discount cannot exceed 100', path: ['discount_value'] })
  .refine(windowOrdered, { message: 'The end date must be later than the start date', path: ['valid_until'] });

export const updateCouponSchema = z
  .object({
    kode: kode.optional(),
    discount_type: couponTipeEnum.optional(),
    discount_value: z.number().min(0).optional(),
    max_quota: z.number().int().positive().nullable().optional(),
    min_purchase: z.number().min(0).nullable().optional(),
    valid_from: z.string().datetime().nullable().optional(),
    valid_until: z.string().datetime().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(percentWithinRange, { message: 'A percentage discount cannot exceed 100', path: ['discount_value'] })
  .refine(windowOrdered, { message: 'The end date must be later than the start date', path: ['valid_until'] });

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
