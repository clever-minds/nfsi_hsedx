/**
 * Util format tampilan — sadar-locale dan sadar-mata-uang.
 *
 * Locale diambil dari vue-i18n; mata uang dari setting `currency.code` yang
 * dimuat store appConfig. Jadi bahasa mengatur CARA menulis angka (pemisah
 * ribuan, posisi simbol) dan setting mengatur MATA UANG-nya.
 *
 * Sejak dukungan multi-mata-uang: setiap nilai yang disimpan berada dalam mata
 * uang BASIS toko. Memilih mata uang lain mengalikannya dengan kurs saat
 * dirender — hanya di `fmtRp`, tidak di tempat lain. Tidak ada nilai tersimpan
 * yang ditulis ulang, sehingga mengubah kurs tidak dapat mengubah order yang
 * sudah terjadi.
 */
import { currentLocaleDef } from '@/i18n';
import { t } from '@/i18n';
import { DEFAULT_CURRENCY, isZeroDecimal } from '@/lib/currencies';
import { useAppConfigStore } from '@/stores/appConfig';
import { useCurrencyStore } from '@/stores/currency';

/**
 * Mata uang aktif. Dibaca lewat store supaya perubahan di layar Pengaturan
 * langsung terpakai; bila Pinia belum siap (dipanggil sangat awal) jatuh ke
 * default agar tidak ada layar yang gagal render.
 */
function activeCurrency(): string {
  try {
    return useAppConfigStore().currency || DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/**
 * Mata uang tampilan beserta kursnya.
 *
 * Jatuh ke basis (kurs 1) bila store mata uang belum siap — dipanggil sangat
 * awal, dan harga yang gagal render lebih buruk daripada harga dalam mata uang
 * bawaan.
 */
function displayCurrency(): { kode: string; rate: number; desimal?: number } {
  try {
    const store = useCurrencyStore();
    if (store.list.length) {
      const a = store.active;
      return { kode: a.kode, rate: a.rate, desimal: a.desimal };
    }
  } catch {
    /* Pinia belum siap */
  }
  return { kode: activeCurrency(), rate: 1 };
}

/** Cache formatter: Intl.* relatif mahal untuk dibuat berulang. */
const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();

function numberFmt(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const { intlNumber } = currentLocaleDef();
  const id = `n:${intlNumber}:${key}`;
  let f = cache.get(id) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(intlNumber, opts);
    cache.set(id, f);
  }
  return f;
}

function dateFmt(key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const { intl } = currentLocaleDef();
  const id = `d:${intl}:${key}`;
  let f = cache.get(id) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(intl, opts);
    cache.set(id, f);
  }
  return f;
}

function relFmt(): Intl.RelativeTimeFormat {
  const { intl } = currentLocaleDef();
  const id = `r:${intl}`;
  let f = cache.get(id) as Intl.RelativeTimeFormat | undefined;
  if (!f) {
    f = new Intl.RelativeTimeFormat(intl, { numeric: 'auto', style: 'short' });
    cache.set(id, f);
  }
  return f;
}

/**
 * Harga, ditulis sesuai konvensi locale aktif.
 *
 * `n` SELALU dalam mata uang basis toko — itulah satu-satunya angka yang
 * disimpan. Bila pembaca memilih mata uang lain, konversi terjadi di sini dan
 * tidak di tempat lain, sehingga tidak ada nilai tersimpan yang pernah ditulis
 * ulang: mengubah kurs tidak bisa mengubah order yang sudah terjadi.
 */
export function fmtRp(n: number | string | null | undefined): string {
  const display = displayCurrency();
  const v = Number(n ?? 0) * display.rate;
  const currency = display.kode;

  // Desimal diambil dari master mata uang bila ada; selain itu ikut Intl,
  // dengan pengecualian mata uang yang dalam praktiknya ditulis tanpa pecahan.
  const decimals = display.desimal ?? (isZeroDecimal(currency) ? 0 : undefined);
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    ...(decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  };
  try {
    return numberFmt(`cur:${currency}`, opts).format(v);
  } catch {
    try {
      // Safari lama tidak mendukung narrowSymbol.
      return numberFmt(`cur-sym:${currency}`, { ...opts, currencyDisplay: 'symbol' }).format(v);
    } catch {
      return `${currency} ${fmtAngka(v)}`;
    }
  }
}

/** Harga, atau label "Gratis" bila 0/null. */
export function fmtHarga(n: number | string | null | undefined): string {
  return Number(n ?? 0) > 0 ? fmtRp(n) : t('common.free');
}

/** Angka biasa dengan pemisah ribuan sesuai locale (hi-IN pakai lakh/crore). */
export function fmtAngka(n: number | string | null | undefined): string {
  return numberFmt('int', { maximumFractionDigits: 0 }).format(Number(n ?? 0));
}

/** Angka ringkas: 1.2K / 3.4M. */
export function fmtCompact(n: number | string | null | undefined): string {
  return numberFmt('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n ?? 0));
}

/** Persen dari nilai 0–100. */
export function fmtPersen(n: number | string | null | undefined, digits = 0): string {
  return numberFmt(`pct${digits}`, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n ?? 0) / 100);
}

function toDate(s?: string | number | Date | null): Date | null {
  if (s === null || s === undefined || s === '') return null;
  const d = s instanceof Date ? s : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tanggal + jam singkat, mis. "17 Aug, 09:30". */
export function fmtTanggal(s?: string | Date | null): string {
  const d = toDate(s);
  if (!d) return '—';
  return dateFmt('dt', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Tanggal saja, mis. "17 Aug 2026". */
export function fmtTanggalSaja(s?: string | Date | null): string {
  const d = toDate(s);
  if (!d) return '—';
  return dateFmt('d', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** Tanggal panjang, mis. "17 August 2026". */
export function fmtTanggalPanjang(s?: string | Date | null): string {
  const d = toDate(s);
  if (!d) return '—';
  return dateFmt('dl', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** Jam saja, mis. "09:30". */
export function fmtJam(s?: string | Date | null): string {
  const d = toDate(s);
  if (!d) return '—';
  return dateFmt('t', { hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Nama hari singkat, mis. "Mon". */
export function fmtHari(s: string | Date): string {
  const d = toDate(s);
  if (!d) return '—';
  return dateFmt('wd', { weekday: 'short' }).format(d);
}

/** Nama bulan panjang, untuk header kalender. */
export function fmtBulan(s: string | Date): string {
  const d = toDate(s);
  if (!d) return '—';
  return dateFmt('mo', { month: 'long', year: 'numeric' }).format(d);
}

/** Nama bulan saja dari nomor bulan 1–12 (untuk dropdown filter periode). */
export function fmtNamaBulan(bulan: number): string {
  return dateFmt('mn', { month: 'long' }).format(new Date(2000, bulan - 1, 1));
}

/** Inisial nama untuk avatar fallback. */
export function initialsOf(nama?: string | null): string {
  const parts = (nama ?? '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toUpperCase();
}

/**
 * Waktu relatif ("5 min ago", "3 hari lagi", "منذ ٣ أيام") lewat
 * Intl.RelativeTimeFormat — otomatis benar untuk keempat bahasa.
 */
export function fmtRelatif(s?: string | Date | null): string {
  const d = toDate(s);
  if (!d) return '—';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const f = relFmt();

  const menit = Math.round(diffMs / 60000);
  if (abs < 60_000) return t('common.justNow');
  if (abs < 3_600_000) return f.format(menit, 'minute');
  if (abs < 86_400_000) return f.format(Math.round(diffMs / 3_600_000), 'hour');
  if (abs < 2_592_000_000) return f.format(Math.round(diffMs / 86_400_000), 'day');
  return fmtTanggalSaja(d);
}

/** Durasi detik → "1j 05m" / "45m" / "30d", dengan satuan terlokalisasi. */
export function fmtDurasi(detik?: number | string | null): string {
  const s = Math.max(0, Math.round(Number(detik ?? 0)));
  const jam = Math.floor(s / 3600);
  const menit = Math.floor((s % 3600) / 60);
  const sisa = s % 60;
  if (jam > 0) return `${fmtAngka(jam)}${t('common.unit.hourShort')} ${String(menit).padStart(2, '0')}${t('common.unit.minuteShort')}`;
  if (menit > 0) return `${fmtAngka(menit)}${t('common.unit.minuteShort')}`;
  return `${fmtAngka(sisa)}${t('common.unit.secondShort')}`;
}

/** Durasi dalam menit → "2j 15m" (dipakai untuk durasi kursus dari BE). */
export function fmtDurasiMenit(menit?: number | string | null): string {
  return fmtDurasi(Number(menit ?? 0) * 60);
}
