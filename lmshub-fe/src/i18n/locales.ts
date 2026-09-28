/**
 * Daftar bahasa yang didukung aplikasi.
 *
 * `code`   — kode yang dipakai vue-i18n & disimpan di localStorage.
 * `intl`   — BCP-47 tag untuk Intl.NumberFormat / Intl.DateTimeFormat.
 * `dir`    — arah tulisan; dipasang ke <html dir> agar Tailwind logical
 *            properties (ps-/pe-/ms-/me-/start-/end-) otomatis membalik.
 */
export interface LocaleDef {
  code: SupportedLocale;
  /** Nama bahasa dalam bahasa itu sendiri (dipakai di language switcher). */
  native: string;
  /** Nama bahasa dalam bahasa Inggris (untuk aria-label & tooltip). */
  english: string;
  dir: 'ltr' | 'rtl';
  /** Tag Intl untuk tanggal & teks. */
  intl: string;
  /** Tag Intl khusus angka — Arab dipaksa angka Latin agar harga tetap terbaca. */
  intlNumber: string;
  /** Emoji bendera sebagai penanda visual ringan (tanpa aset gambar). */
  flag: string;
}

export const SUPPORTED_LOCALES = ['en', 'hi'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const LOCALES: Record<SupportedLocale, LocaleDef> = {
  en: {
    code: 'en',
    native: 'English',
    english: 'English',
    dir: 'ltr',
    intl: 'en-US',
    intlNumber: 'en-US',
    flag: '🇬🇧',
  },
  hi: {
    code: 'hi',
    native: 'हिन्दी',
    english: 'Hindi',
    dir: 'ltr',
    intl: 'hi-IN',
    intlNumber: 'hi-IN',
    flag: '🇮🇳',
  },
};

export const LOCALE_LIST: LocaleDef[] = SUPPORTED_LOCALES.map((c) => LOCALES[c]);

export function isSupportedLocale(v: unknown): v is SupportedLocale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

/** Cocokkan preferensi browser ke bahasa yang didukung (mis. "id-ID" → "id"). */
export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
