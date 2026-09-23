import { z } from 'zod';

export const orderItemSchema = z
  .object({
    item_tipe: z.enum(['kursus', 'bundle', 'path', 'langganan']),
    course_id: z.string().uuid().optional(),
    learning_path_id: z.string().uuid().optional(),
    bundle_group_id: z.string().uuid().optional(),
    kuantitas: z.number().int().positive().default(1),
    // dipakai hanya untuk item_tipe='langganan' (belum ada katalog paket langganan tersendiri)
    harga_satuan: z.number().nonnegative().optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .refine(
    (d) =>
      (['kursus', 'bundle'].includes(d.item_tipe) && !!d.course_id) ||
      (d.item_tipe === 'path' && !!d.learning_path_id) ||
      (d.item_tipe === 'langganan' && !d.course_id && !d.learning_path_id),
    { message: 'That combination of item_tipe and item reference is not valid', path: ['item_tipe'] },
  );

export const checkoutSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  coupon_kode: z.string().min(2).max(50).optional(),
  catatan: z.string().max(1000).optional(),
});

export const manualOrderSchema = z.object({
  buyer_user_id: z.string().uuid(),
  items: z.array(orderItemSchema).min(1),
  coupon_kode: z.string().min(2).max(50).optional(),
  marketing_user_id: z.string().uuid().optional(), // default: pelaku (marketing) bila peran marketing
  catatan: z.string().max(1000).optional(),
});

/**
 * Pencatatan pembayaran luar-jaringan. Hanya metode yang uangnya dipastikan oleh
 * manusia yang boleh lewat sini; hasilnya selalu `menunggu_verifikasi`.
 * Kartu/VA/e-wallet/QRIS ditangani `POST /orders/:id/pay-gateway` dan dilunasi
 * oleh webhook provider.
 */
export const paySchema = z.object({
  jenis: z.enum(['penuh', 'dp', 'cicilan']),
  nominal: z.number().positive(),
  metode: z.enum(['transfer_bank', 'tunai', 'lainnya']),
  bukti_media_id: z.string().uuid().optional(),
  referensi_gateway: z.string().max(150).optional(),
});

export const verifyPaymentSchema = z.object({
  /** Kosongkan bila order hanya punya satu pembayaran yang menunggu verifikasi. */
  payment_id: z.string().uuid().optional(),
  aksi: z.enum(['verify', 'reject']),
  catatan_verifikasi: z.string().max(500).optional(),
});

/** FINANSIAL — approval Direktur wajib (requirePermission('refund','update')). */
export const refundSchema = z.object({
  nominal: z.number().positive(),
  alasan: z.string().min(3).max(1000),
  metode_pengembalian: z.string().max(30).optional(),
  catatan: z.string().max(1000).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;
export type PayInput = z.infer<typeof paySchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
