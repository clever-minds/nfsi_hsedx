import { z } from 'zod';

// ── content_pages ────────────────────────────────────────────────────────
export const createPageSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(150)
    .regex(/^[a-z0-9-]+$/, 'A slug may contain only lowercase letters, digits and hyphens'),
  judul: z.string().min(2).max(200),
  konten: z.unknown().optional(),
  tipe: z.enum(['tentang', 'faq', 'kebijakan', 'halaman']).default('halaman'),
  status: z.enum(['draft', 'terbit', 'arsip']).default('draft'),
  meta_seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      og_image: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    })
    .optional(),
});

export const updatePageSchema = z.object({
  judul: z.string().min(2).max(200).optional(),
  konten: z.unknown().optional(),
  tipe: z.enum(['tentang', 'faq', 'kebijakan', 'halaman']).optional(),
  status: z.enum(['draft', 'terbit', 'arsip']).optional(),
  meta_seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      og_image: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
});

// ── settings ─────────────────────────────────────────────────────────────
/**
 * Aset merek (logo/ikon) dikirim base64 di payload JSON, sama seperti foto
 * profil. Limit body 2mb → gambar efektif sekitar 1.5MB setelah overhead base64.
 */
export const uploadBrandAssetSchema = z.object({
  jenis: z.enum(['logo', 'icon']),
  data_base64: z.string().min(1, 'Image data is required'),
  // SVG sengaja tidak diterima: bisa memuat <script>, dan file ini disajikan
  // dari origin API sehingga akan dieksekusi bila dibuka langsung.
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const updateSettingSchema = z.object({
  nilai: z.string().nullable().optional(),
  nilai_json: z.unknown().optional(),
});

export type CreatePageInput = z.infer<typeof createPageSchema>;
export type UpdatePageInput = z.infer<typeof updatePageSchema>;
export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;
export type UploadBrandAssetInput = z.infer<typeof uploadBrandAssetSchema>;
