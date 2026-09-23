import { z } from 'zod';
import { SECTION_KEYS } from './site-content.defaults';

/**
 * Setiap blok konten divalidasi utuh, bukan per field.
 *
 * `PUT /site-content/:key` selalu menerima objek lengkap dan menggantikan isi
 * baris. Menyimpan sebagian akan membuat daftar (sosmed, kolom footer, urutan
 * seksi) mustahil dipangkas — tidak ada cara menyatakan "hapus elemen ini"
 * lewat penggabungan.
 */

const BAHASA = ['en', 'hi'] as const;

/** Teks per bahasa; bahasa yang kosong berarti jatuh ke teks bawaan aplikasi. */
const localized = z
  .object(Object.fromEntries(BAHASA.map((l) => [l, z.string().max(2000).optional()])) as Record<
    (typeof BAHASA)[number],
    z.ZodOptional<z.ZodString>
  >)
  .strict()
  .default({});

/**
 * Tautan dibatasi http(s), mailto/tel, path internal, atau `#` sebagai
 * placeholder. Skema lain (terutama `javascript:`) ditolak karena nilainya
 * berakhir di atribut `href` halaman publik.
 */
const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(v), {
    message: 'A link must start with http(s)://, mailto:, tel:, / or #',
  });

export const kontakSchema = z.object({
  alamat: localized,
  telepon: z.string().trim().max(40).default(''),
  email: z.union([z.string().trim().email(), z.literal('')]).default(''),
  tampilkan_topbar: z.boolean().default(true),
});

export const sosialSchema = z.array(
  z.object({
    platform: z.enum(['facebook', 'instagram', 'twitter', 'youtube', 'linkedin', 'tiktok', 'whatsapp', 'telegram']),
    url: url,
    aktif: z.boolean().default(true),
  }),
).max(12);

export const menuSchema = z.array(
  z.object({
    label: localized,
    url: url,
    aktif: z.boolean().default(true),
  }),
).max(10);

export const heroSchema = z.object({
  aktif: z.boolean().default(true),
  badge: localized,
  judul_pre: localized,
  judul_highlight: localized,
  judul_post: localized,
  subjudul: localized,
  gambar_url: z.string().trim().max(500).default(''),
  tampilkan_pencarian: z.boolean().default(true),
  tampilkan_rating: z.boolean().default(true),
  rating_skor: z.string().trim().max(20).default(''),
  rating_teks: localized,
  tampilkan_kartu_siswa: z.boolean().default(true),
  tampilkan_kartu_kursus: z.boolean().default(true),
});

export const sectionsSchema = z
  .array(
    z.object({
      key: z.enum(SECTION_KEYS),
      aktif: z.boolean().default(true),
      badge: localized,
      judul: localized,
      subjudul: localized,
    }),
  )
  // Urutan array = urutan tampil. Duplikat ditolak supaya satu seksi tidak
  // digambar dua kali dengan pengaturan yang berbeda.
  .refine((rows) => new Set(rows.map((r) => r.key)).size === rows.length, {
    message: 'A section may not appear more than once',
  });

export const footerSchema = z.object({
  deskripsi: localized,
  kolom: z
    .array(
      z.object({
        judul: localized,
        tautan: z.array(z.object({ label: localized, url: url })).max(12),
      }),
    )
    .max(4),
  newsletter: z.object({
    aktif: z.boolean().default(true),
    judul: localized,
    teks: localized,
  }),
  copyright: localized,
  tampilkan_sosial: z.boolean().default(true),
});

/** Skema per blok, dipilih berdasarkan `:key` di rute. */
export const SITE_CONTENT_SCHEMA = {
  kontak: kontakSchema,
  sosial: sosialSchema,
  menu: menuSchema,
  hero: heroSchema,
  sections: sectionsSchema,
  footer: footerSchema,
} as const;

export const uploadSiteAssetSchema = z.object({
  body: z.object({
    /** Saat ini hanya gambar hero; enum agar penambahan aset baru eksplisit. */
    jenis: z.enum(['hero']),
    data_base64: z.string().min(1),
    mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  }),
});

export type UploadSiteAssetInput = z.infer<typeof uploadSiteAssetSchema>['body'];
