import { z } from 'zod';

// ── content_pages ────────────────────────────────────────────────────────
const slugSchema = z
  .string()
  .min(2)
  .max(150)
  .regex(/^[a-z0-9-]+$/, 'A slug may contain only lowercase letters, digits and hyphens');

const metaSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  og_image: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

/**
 * Isi halaman dikirim sebagai HTML (`konten_html`) from editor Admin Panel dan
 * disanitasi di server sebelum disimpan. `content` (JSON bebas) tetap diterima
 * demi klien lama; bila berisi `html`, bagian itu ikut disanitasi.
 */
const kontenHtmlSchema = z.string().max(200_000);

export const createPageSchema = z.object({
  slug: slugSchema,
  title: z.string().min(2).max(200),
  content: z.unknown().optional(),
  konten_html: kontenHtmlSchema.optional(),
  type: z.enum(['about', 'faq', 'policy', 'page']).default('page'),
  status: z.enum(['draft', 'publish', 'archived']).default('draft'),
  show_in_footer: z.boolean().default(false),
  footer_sort_order: z.number().int().min(0).max(999).default(0),
  meta_seo: metaSeoSchema.optional(),
});

export const updatePageSchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().min(2).max(200).optional(),
  content: z.unknown().optional(),
  konten_html: kontenHtmlSchema.optional(),
  type: z.enum(['about', 'faq', 'policy', 'page']).optional(),
  status: z.enum(['draft', 'publish', 'archived']).optional(),
  show_in_footer: z.boolean().optional(),
  footer_sort_order: z.number().int().min(0).max(999).optional(),
  meta_seo: metaSeoSchema.nullable().optional(),
});

// ── settings ─────────────────────────────────────────────────────────────
/**
 * Aset merek (logo/ikon) dikirim base64 di payload JSON, sama seperti photo
 * profile. Limit body 2mb → gambar efektif sekitar 1.5MB setelah overhead base64.
 */
export const uploadBrandAssetSchema = z.object({
  type: z.enum(['logo', 'icon']),
  data_base64: z.string().min(1, 'Image data is required'),
  // SVG sengaja no diterima: bisa memuat <script>, dan file ini disajikan
  // from origin API sehingga akan dieksekusi bila dibuka langsung.
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const updateSettingSchema = z.object({
  value: z.string().nullable().optional(),
  value_json: z.unknown().optional(),
});

export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
export type UploadBrandAssetInput = z.infer<typeof uploadBrandAssetSchema>;
