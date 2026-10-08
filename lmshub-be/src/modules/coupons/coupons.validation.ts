import { z } from 'zod';

export const couponTipeEnum = z.enum(['persen', 'nominal']);

/**
 * Kode dipakai apa adanya oleh pembeli saat checkout, jadi dibatasi ke karakter
 * yang selamat lewat URL, email dan salin-tempel: huruf, angka, garis dan garis
 * bawah. Kolomnya `citext`, sehingga 'HEMAT10' dan 'hemat10' adalah kode yang
 * sama dan tidak bisa didaftarkan dua kali.
 */
const kode = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphen or underscore only');

const base = {
  tipe_potongan: couponTipeEnum,
  nilai_potongan: z.number().min(0),
  kuota_maksimal: z.number().int().positive().nullable().optional(),
  minimum_pembelian: z.number().min(0).nullable().optional(),
  berlaku_mulai: z.string().datetime().nullable().optional(),
  berlaku_sampai: z.string().datetime().nullable().optional(),
  is_active: z.boolean().optional(),
};

/** Potongan persen di atas 100 akan membuat total negatif. */
const percentWithinRange = (d: { tipe_potongan?: string; nilai_potongan?: number }) =>
  d.tipe_potongan !== 'persen' || d.nilai_potongan === undefined || d.nilai_potongan <= 100;

/** Jendela berlaku yang terbalik membuat kupon tidak pernah bisa dipakai. */
const windowOrdered = (d: { berlaku_mulai?: string | null; berlaku_sampai?: string | null }) =>
  !d.berlaku_mulai || !d.berlaku_sampai || new Date(d.berlaku_sampai) > new Date(d.berlaku_mulai);

export const createCouponSchema = z
  .object({ kode, ...base })
  .refine(percentWithinRange, { message: 'A percentage discount cannot exceed 100', path: ['nilai_potongan'] })
  .refine(windowOrdered, { message: 'The end date must be later than the start date', path: ['berlaku_sampai'] });

export const updateCouponSchema = z
  .object({
    kode: kode.optional(),
    tipe_potongan: couponTipeEnum.optional(),
    nilai_potongan: z.number().min(0).optional(),
    kuota_maksimal: z.number().int().positive().nullable().optional(),
    minimum_pembelian: z.number().min(0).nullable().optional(),
    berlaku_mulai: z.string().datetime().nullable().optional(),
    berlaku_sampai: z.string().datetime().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(percentWithinRange, { message: 'A percentage discount cannot exceed 100', path: ['nilai_potongan'] })
  .refine(windowOrdered, { message: 'The end date must be later than the start date', path: ['berlaku_sampai'] });

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
