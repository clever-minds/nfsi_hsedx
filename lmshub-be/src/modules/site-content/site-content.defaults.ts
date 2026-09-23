/**
 * Nilai bawaan halaman publik.
 *
 * Ini adalah sumber kebenaran untuk instalasi yang belum pernah menyentuh menu
 * Website: `GET /site-content` mengembalikan objek ini, ditimpa baris yang ada
 * di tabel `site_content`. Karena itu menambah field baru di rilis berikutnya
 * cukup dilakukan di berkas ini — tidak perlu migrasi data.
 *
 * Teks dibiarkan kosong dengan sengaja. Kosong berarti "pakai teks bawaan
 * aplikasi", dan teks bawaan itu hidup di katalog i18n frontend sehingga tetap
 * tersedia dalam empat bahasa. Begitu admin mengisi salah satu bahasa, nilai
 * itulah yang dipakai untuk bahasa tersebut.
 */

/** Teks per bahasa. Kunci yang kosong/absen berarti jatuh ke teks bawaan. */
export interface Localized {
  en?: string;
  id?: string;
  ar?: string;
  hi?: string;
}

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
  kontak: {
    alamat: Localized;
    telepon: string;
    email: string;
    tampilkan_topbar: boolean;
  };
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

export type SiteContentKey = keyof SiteContent;

/**
 * Seksi halaman depan yang boleh diurutkan & dimatikan.
 *
 * Hero tidak ikut di sini karena posisinya selalu paling atas dan punya
 * kelompok pengaturannya sendiri.
 */
export const SECTION_KEYS = ['kategori', 'benefit', 'featured', 'stats', 'instruktur', 'cta'] as const;

const kosong = (): Localized => ({});

const seksi = (key: string): SectionItem => ({
  key,
  aktif: true,
  badge: kosong(),
  judul: kosong(),
  subjudul: kosong(),
});

export const DEFAULT_SITE_CONTENT: SiteContent = {
  kontak: {
    alamat: { en: 'National Fire Safety Institute, Shree C. K. Bhagat Patidar Chatralaya, Opp. Old Krishna Cinema, Nr. Jayratna Building, Siddhnath Road, Vadodara, Gujarat, India', id: 'National Fire Safety Institute, Shree C. K. Bhagat Patidar Chatralaya, Opp. Old Krishna Cinema, Nr. Jayratna Building, Siddhnath Road, Vadodara, Gujarat, India' },
    telepon: '+91-95589-20016',
    email: 'hsedx@nfsi.in',
    tampilkan_topbar: true,
  },
  sosial: [
    { platform: 'facebook', url: '#', aktif: true },
    { platform: 'instagram', url: '#', aktif: true },
    { platform: 'twitter', url: '#', aktif: true },
    { platform: 'youtube', url: '#', aktif: true },
    { platform: 'linkedin', url: '#', aktif: true },
  ],
  // Kosong berarti memakai menu bawaan (Beranda / Kursus / Instruktur) yang
  // sudah diterjemahkan; admin bisa menggantinya dengan susunan sendiri.
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
  sections: SECTION_KEYS.map(seksi),
  footer: {
    deskripsi: kosong(),
    // Kosong berarti memakai dua kolom bawaan (Jelajahi & Bantuan).
    kolom: [],
    newsletter: { aktif: true, judul: kosong(), teks: kosong() },
    copyright: kosong(),
    tampilkan_sosial: true,
  },
};

export const SITE_CONTENT_KEYS = Object.keys(DEFAULT_SITE_CONTENT) as SiteContentKey[];

export function isSiteContentKey(key: string): key is SiteContentKey {
  return (SITE_CONTENT_KEYS as string[]).includes(key);
}
