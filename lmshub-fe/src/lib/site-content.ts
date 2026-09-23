/**
 * Bentuk konten halaman publik dan cara membacanya.
 *
 * Backend menyimpan teks sebagai objek per bahasa yang boleh setengah terisi.
 * Kosong bukan berarti "tampilkan kosong", melainkan "pakai teks bawaan
 * aplikasi" — dan teks bawaan itu ada di katalog i18n, lengkap empat bahasa.
 * Semua pembacaan karena itu lewat `pickText()`, yang selalu diberi teks
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
  aktif: boolean;
}
export interface MenuItem {
  label: Localized;
  url: string;
  aktif: boolean;
}
export interface SectionItem {
  key: string;
  aktif: boolean;
  badge: Localized;
  judul: Localized;
  subjudul: Localized;
}
export interface FooterTautan {
  label: Localized;
  url: string;
}
export interface FooterKolom {
  judul: Localized;
  tautan: FooterTautan[];
}

export interface SiteContent {
  kontak: { alamat: Localized; telepon: string; email: string; tampilkan_topbar: boolean };
  sosial: SosialItem[];
  menu: MenuItem[];
  hero: {
    aktif: boolean;
    badge: Localized;
    judul_pre: Localized;
    judul_highlight: Localized;
    judul_post: Localized;
    subjudul: Localized;
    gambar_url: string;
    tampilkan_pencarian: boolean;
    tampilkan_rating: boolean;
    rating_skor: string;
    rating_teks: Localized;
    tampilkan_kartu_siswa: boolean;
    tampilkan_kartu_kursus: boolean;
  };
  sections: SectionItem[];
  footer: {
    deskripsi: Localized;
    kolom: FooterKolom[];
    newsletter: { aktif: boolean; judul: Localized; teks: Localized };
    copyright: Localized;
    tampilkan_sosial: boolean;
  };
}

/** Seksi yang boleh diurutkan & dimatikan; harus sama dengan katalog backend. */
export const SECTION_KEYS = ['kategori', 'benefit', 'featured', 'stats', 'instruktur', 'cta'] as const;

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
    aktif: true,
    badge: kosong(),
    judul_pre: kosong(),
    judul_highlight: kosong(),
    judul_post: kosong(),
    subjudul: kosong(),
    gambar_url: '',
    tampilkan_pencarian: true,
    tampilkan_rating: true,
    rating_skor: '',
    rating_teks: kosong(),
    tampilkan_kartu_siswa: true,
    tampilkan_kartu_kursus: true,
  },
  sections: SECTION_KEYS.map((key) => ({ key, aktif: true, badge: kosong(), judul: kosong(), subjudul: kosong() })),
  footer: {
    deskripsi: kosong(),
    kolom: [],
    newsletter: { aktif: true, judul: kosong(), teks: kosong() },
    copyright: kosong(),
    tampilkan_sosial: true,
  },
};

/**
 * Teks untuk bahasa yang sedang aktif.
 *
 * Urutan: bahasa aktif → Inggris (bahasa dasar sistem) → teks bawaan aplikasi.
 * Langkah tengahnya penting: admin yang hanya mengisi satu bahasa tetap ingin
 * isian itu terlihat oleh pengunjung berbahasa lain, bukan tergantikan diam-diam
 * oleh teks contoh.
 */
export function pickText(nilai: Localized | undefined, bawaan = ''): string {
  if (!nilai) return bawaan;
  const aktif = (nilai[currentLocale() as LocaleKey] ?? '').trim();
  if (aktif) return aktif;
  const en = (nilai.en ?? '').trim();
  return en || bawaan;
}

/** True bila ada minimal satu bahasa terisi — dipakai untuk memutuskan override. */
export function adaTeks(nilai: Localized | undefined): boolean {
  return !!nilai && LOCALE_KEYS.some((l) => (nilai[l] ?? '').trim());
}

/**
 * Saring tautan sebelum masuk atribut `href`.
 *
 * Backend sudah menolak skema berbahaya saat menyimpan, tapi baris lama atau
 * respons yang dimanipulasi di tengah jalan tidak melewati validasi itu — dan
 * ongkos memeriksa ulang di sini nyaris nol.
 */
export function safeHref(url: string | undefined): string {
  const v = (url ?? '').trim();
  if (!v) return '#';
  return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(v) ? v : '#';
}
