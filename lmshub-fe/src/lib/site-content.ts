/**
 * Bentuk content halaman publik dan cara membacanya.
 *
 * Backend menyimpan text sebagai objek per language yang boleh setengah terisi.
 * Kosong bukan berarti "tampilkan kosong", melainkan "pakai text bawaan
 * aplikasi" — dan text bawaan itu ada di catalog i18n, lengkap empat language.
 * Semua pembacaan karena itu lewat `pickText()`, yang selalu diberi text
 * bawaan sebagai argumen terakhir.
 */
import { currentLocale } from '@/i18n';

export interface Localized {
  en?: string;
  hi?: string;
}

export type LocaleKey = keyof Localized;
export const LOCALE_KEYS: LocaleKey[] = ['en', 'hi'];

export interface SosialItem {
  platform: string;
  url: string;
  active: boolean;
}
export interface MenuItem {
  label: Localized;
  url: string;
  active: boolean;
}
export interface SectionItem {
  key: string;
  active: boolean;
  badge: Localized;
  title: Localized;
  subjudul: Localized;
}
export interface FooterTautan {
  label: Localized;
  url: string;
}
export interface FooterKolom {
  title: Localized;
  tautan: FooterTautan[];
}

export interface SiteContent {
  kontak: { alamat: Localized; telepon: string; email: string; tampilkan_topbar: boolean };
  sosial: SosialItem[];
  menu: MenuItem[];
  hero: {
    active: boolean;
    badge: Localized;
    title_pre: Localized;
    title_highlight: Localized;
    title_post: Localized;
    subjudul: Localized;
    gambar_url: string;
    tampilkan_pencarian: boolean;
    tampilkan_rating: boolean;
    rating_score: string;
    rating_teks: Localized;
    tampilkan_kartu_siswa: boolean;
    tampilkan_kartu_kursus: boolean;
  };
  sections: SectionItem[];
  footer: {
    description: Localized;
    kolom: FooterKolom[];
    newsletter: { active: boolean; title: Localized; text: Localized };
    copyright: Localized;
    tampilkan_sosial: boolean;
  };
}

/** Seksi yang boleh disort_orderkan & dimatikan; harus sama dengan catalog backend. */
export const SECTION_KEYS = ['category', 'benefit', 'featured', 'stats', 'instructor', 'cta'] as const;

/** Platform sosmed yang punya ikon di aplikasi. */
export const SOSIAL_PLATFORMS = [
  'facebook',
  'instagram',
  'twitter',
  'youtube',
  'linkedin',
  'tiktok',
  'whatsapp',
  'telegram',
] as const;

const kosong = (): Localized => ({});

export const DEFAULT_SITE_CONTENT: SiteContent = {
  kontak: { alamat: kosong(), telepon: '', email: '', tampilkan_topbar: true },
  sosial: [],
  menu: [],
  hero: {
    active: true,
    badge: kosong(),
    title_pre: kosong(),
    title_highlight: kosong(),
    title_post: kosong(),
    subjudul: kosong(),
    gambar_url: '',
    tampilkan_pencarian: true,
    tampilkan_rating: true,
    rating_score: '',
    rating_teks: kosong(),
    tampilkan_kartu_siswa: true,
    tampilkan_kartu_kursus: true,
  },
  sections: SECTION_KEYS.map((key) => ({ key, active: true, badge: kosong(), title: kosong(), subjudul: kosong() })),
  footer: {
    description: kosong(),
    kolom: [],
    newsletter: { active: true, title: kosong(), text: kosong() },
    copyright: kosong(),
    tampilkan_sosial: true,
  },
};

/**
 * Teks untuk language yang sedang active.
 *
 * Urutan: language active → Inggris (language base sistem) → text bawaan aplikasi.
 * Langkah tengahnya penting: admin yang hanya mengisi satu language tetap ingin
 * isian itu terlihat by pengunjung berlanguage lain, bukan tergantikan diam-diam
 * by text contoh.
 */
export function pickText(value: Localized | undefined, bawaan = ''): string {
  if (!value) return bawaan;
  const active = (value[currentLocale() as LocaleKey] ?? '').trim();
  if (active) return active;
  const en = (value.en ?? '').trim();
  return en || bawaan;
}

/** True bila ada minimal satu language terisi — dipakai untuk memutuskan override. */
export function adaTeks(value: Localized | undefined): boolean {
  return !!value && LOCALE_KEYS.some((l) => (value[l] ?? '').trim());
}

/**
 * Saring tautan sebelum login atribut `href`.
 *
 * Backend sudah menolak skema berbahaya saat menyimpan, tapi baris lama atau
 * response yang dimanipulasi di tengah jalan no melewati validasi itu — dan
 * ongkos memeriksa ulang di sini nyaris nol.
 */
export function safeHref(url: string | undefined): string {
  const v = (url ?? '').trim();
  if (!v) return '#';
  return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(v) ? v : '#';
}
