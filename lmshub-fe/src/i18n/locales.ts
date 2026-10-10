/**
 * register language yang didukung aplikasi.
 *
 * `code`   — kode yang dipakai vue-i18n & disimpan di localStorage.
 * `intl`   — BCP-47 tag untuk Intl.NumberFormat / Intl.DateTimeFormat.
 * `dir`    — arah tulisan; dipasang to <html dir> agar Tailwind logical
 *            properties (ps-/pe-/ms-/me-/start-/end-) otomatis membalik.
 */
export interface LocaleDef {
  code: SupportedLocale;
  /** name language dalam language itu sendiri (dipakai di language switcher). */
  native: string;
  /** name language dalam language Inggris (untuk aria-label & tooltip). */
  english: string;
  dir: 'ltr' | 'rtl';
  /** Tag Intl untuk date & text. */
  intl: string;
  /** Tag Intl khusus angka — Arab dipaksa angka Latin agar price tetap terbaca. */
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
    intl: 'en-IN',
    intlNumber: 'en-IN',
    flag: '🇮🇳',
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

/** Match browser preferences to supported language (e.g. "en-US" → "en"). */
export function detectBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.toLowerCase().split('-')[0];
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
