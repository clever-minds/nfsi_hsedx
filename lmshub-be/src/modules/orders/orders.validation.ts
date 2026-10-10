import { z } from 'zod';

export const orderItemSchema = z
  .object({
    item_type: z.enum(['course', 'bundle', 'path', 'subscription']),
    course_id: z.string().uuid().optional(),
    learning_path_id: z.string().uuid().optional(),
    bundle_group_id: z.string().uuid().optional(),
    quantity: z.number().int().positive().default(1),
    // dipakai hanya untuk item_type='subscription' (belum ada catalog package langganan tersendiri)
    price_unit: z.number().nonnegative().optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .refine(
    (d) =>
      (['course', 'bundle'].includes(d.item_type) && !!d.course_id) ||
      (d.item_type === 'path' && !!d.learning_path_id) ||
      (d.item_type === 'subscription' && !d.course_id && !d.learning_path_id),
    { message: 'That combination of item_type and item reference is not valid', path: ['item_type'] },
  );

export const checkoutSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  coupon_kode: z.string().min(2).max(50).optional(),
  notes: z.string().max(1000).optional(),
});

export const manualOrderSchema = z.object({
  buyer_user_id: z.string().uuid(),
  items: z.array(orderItemSchema).min(1),
  coupon_kode: z.string().min(2).max(50).optional(),
  marketing_user_id: z.string().uuid().optional(), // default: pelaku (marketing) bila peran marketing
  notes: z.string().max(1000).optional(),
});

/**
 * Pennotes payment luar-jaringan. Hanya method yang uangnya dipastikan by
 * manusia yang boleh lewat sini; hasilnya selalu `menunggu_verifikasi`.
 * Kartu/VA/e-wallet/QRIS ditangani `POST /orders/:id/pay-gateway` dan dilunasi
 * by webhook provider.
 */
export const paySchema = z.object({
  type: z.enum(['full', 'down_payment', 'installment']),
  amount: z.number().positive(),
  method: z.enum(['transfer_bank', 'tunai', 'other']),
  proof_media_id: z.string().uuid().optional(),
  gateway_reference: z.string().max(150).optional(),
});

export const verifyPaymentSchema = z.object({
  /** Kosongkan bila order hanya punya satu payment yang menunggu verifikasi. */
  payment_id: z.string().uuid().optional(),
  action: z.enum(['verify', 'reject']),
  notes_verifikasi: z.string().max(500).optional(),
});

/** FINANSIAL — approval Direktur wajib (requirePermission('refund','update')). */
export const refundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(3).max(1000),
  method_pengembalian: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;
export type PayInput = z.infer<typeof paySchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
