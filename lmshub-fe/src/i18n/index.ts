import { createI18n } from 'vue-i18n';
import {
  DEFAULT_LOCALE,
  LOCALES,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  isSupportedLocale,
  type SupportedLocale,
} from './locales';

export * from './locales';

const STORAGE_KEY = 'locale';

/**
 * Semua pesan dimuat eager lewat glob: setiap file JSON di
 * `messages/<locale>/<namespace>.json` jadi namespace tingkat atas.
 * Menambah namespace baru cukup dengan menaruh file — tanpa ubah file ini.
 */
const files = import.meta.glob<{ default: Record<string, unknown> }>('./messages/*/*.json', { eager: true });

const messages = SUPPORTED_LOCALES.reduce(
  (acc, code) => {
    acc[code] = {};
    return acc;
  },
  {} as Record<SupportedLocale, Record<string, unknown>>,
);

for (const [path, mod] of Object.entries(files)) {
  const m = path.match(/\.\/messages\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, locale, namespace] = m;
  if (!isSupportedLocale(locale)) continue;
  messages[locale][namespace] = mod.default;
}

/** Bahasa awal: pilihan tersimpan → deteksi browser → default (Inggris). */
function initialLocale(): SupportedLocale {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (isSupportedLocale(saved)) return saved;
  return detectBrowserLocale();
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  // Fallback ke Inggris dilakukan diam-diam; hanya diberitahu saat dev.
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
  messages: messages as never,
});

/**
 * Akses global vue-i18n lewat antarmuka sederhana.
 *
 * Tipe pesan vue-i18n di-infer dari katalog; untuk katalog sebesar ini
 * `vue-tsc` menyerah dengan TS2589 (instantiation too deep). Kita hanya
 * butuh t/te/locale, jadi cukup narrow ke bentuk minimal ini.
 */
interface GlobalI18n {
  t: (key: string, ...args: unknown[]) => string;
  te: (key: string) => boolean;
  locale: { value: string };
}

const g = i18n.global as unknown as GlobalI18n;

/** Locale aktif, aman dipanggil dari luar komponen (mis. helper format). */
export function currentLocale(): SupportedLocale {
  return g.locale.value as SupportedLocale;
}

export function currentLocaleDef() {
  return LOCALES[currentLocale()];
}

/** Terjemahan di luar komponen (store, interceptor axios, helper format). */
export const t: GlobalI18n['t'] = (key, ...args) => g.t(key, ...args);
export const te: GlobalI18n['te'] = (key) => g.te(key);

/**
 * Ganti bahasa: set vue-i18n, simpan pilihan, sinkronkan atribut dokumen.
 * `<html dir>` yang bikin seluruh layout Tailwind logical-property membalik.
 */
export function setLocale(locale: SupportedLocale) {
  if (!isSupportedLocale(locale)) return;
  g.locale.value = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage bisa diblokir (private mode) — abaikan */
  }
  applyDocumentLocale(locale);
}

/** Pasang lang/dir ke <html> + kelas bantu untuk styling khusus RTL. */
export function applyDocumentLocale(locale: SupportedLocale = currentLocale()) {
  if (typeof document === 'undefined') return;
  const def = LOCALES[locale];
  const el = document.documentElement;
  el.setAttribute('lang', def.code);
  el.setAttribute('dir', def.dir);
  el.classList.toggle('is-rtl', def.dir === 'rtl');
}
