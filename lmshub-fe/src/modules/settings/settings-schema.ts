/**
 * Metadata layar Pengaturan.
 *
 * Backend menyimpan label & deskripsi setting dalam satu bahasa (Indonesia).
 * Modul ini memetakan tiap `key` ke kunci i18n, sehingga layar Pengaturan ikut
 * berganti bahasa seperti layar lain — sambil tetap memakai label dari backend
 * sebagai cadangan bila ada setting baru yang belum diterjemahkan.
 *
 * Di sini pula ditentukan kontrol input tiap setting: mata uang jadi dropdown,
 * angka jadi input number, dan setting bertipe JSON dapat editor terstruktur
 * alih-alih memaksa admin mengetik JSON mentah.
 */
import { te, t } from '@/i18n';
import { useCurrencyStore } from '@/stores/currency';

export interface SettingItem {
  key: string;
  grup?: string;
  nilai: string;
  label?: string;
  tipe_nilai?: string;
  satuan?: string | null;
  is_public?: boolean;
  /** Rahasia: dibaca balik sebagai topeng, tidak pernah nilai aslinya. */
  is_encrypted?: boolean;
  deskripsi?: string;
}

export type SettingControl = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'commissionTiers' | 'json';

export interface SelectOption {
  /** Baris kedua opsional, mis. kurs terhadap mata uang basis. */
  hint?: string;
  value: string;
  label: string;
}

/** Kunci i18n aman: titik pada key setting bertabrakan dengan path vue-i18n. */
function keyId(key: string): string {
  return key.replace(/\./g, '_');
}

/** Label setting — terjemahan bila ada, kalau tidak pakai label dari backend. */
export function settingLabel(item: SettingItem): string {
  const k = `settings.item.${keyId(item.key)}.label`;
  return te(k) ? t(k) : item.label || item.key;
}

/** Deskripsi setting — terjemahan bila ada, kalau tidak dari backend. */
export function settingDescription(item: SettingItem): string {
  const k = `settings.item.${keyId(item.key)}.desc`;
  return te(k) ? t(k) : item.deskripsi || '';
}

/** Nama grup — terjemahan bila ada, kalau tidak kode grup yang dirapikan. */
export function groupLabel(grup: string): string {
  const k = `settings.group.${grup}`;
  return te(k) ? t(k) : grup.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Setting yang sudah dipensiunkan dan tidak dibaca kode mana pun lagi.
 *
 * Migrasi 0150 menghapus barisnya dari database, tapi instalasi yang belum
 * dimigrasi masih akan mengirimkannya lewat `GET /settings`. Menampilkannya
 * lebih buruk daripada menyembunyikannya: admin akan mengira sedang mengubah
 * sesuatu, padahal tidak ada yang membaca nilainya.
 *
 *  - `notifikasi.default_kanal` → kanal per-event diatur di Notifikasi › Preferensi
 *  - `bank.*`                   → pindah ke master data Rekening Bank
 *  - `lembaga.nama`             → dilebur ke `brand.nama_aplikasi`
 */
const RETIRED_KEYS = new Set([
  'notifikasi.default_kanal',
  'bank.nama',
  'bank.nomor_rekening',
  'bank.atas_nama',
  'lembaga.nama',
]);

export function isRetired(item: SettingItem): boolean {
  return RETIRED_KEYS.has(item.key);
}

/**
 * Urutan tampil grup. Yang paling sering disentuh admin ditaruh di atas;
 * grup di luar daftar ini muncul setelahnya, urut abjad.
 */
const GROUP_ORDER = [
  'brand',
  'currency',
  'harga',
  'checkout',
  // Pembayaran tepat setelah checkout: satu grup sakelar, lalu satu grup
  // kredensial per gateway — urutannya sama dengan urutan di layar checkout.
  'payment',
  'payment_stripe',
  'payment_paypal',
  'payment_razorpay',
  'payment_paystack',
  'payment_flutterwave',
  'payment_mollie',
  'payment_midtrans',
  'komisi',
  'revenue_share',
  'sertifikat',
  'kontak',
  'auth',
  'smtp',
];

/**
 * Urutan item di dalam satu grup.
 *
 * Hanya dibutuhkan untuk sakelar gateway: server mengembalikannya urut abjad,
 * sehingga Flutterwave muncul sebelum Stripe dan daftar sakelar tidak
 * menyerupai urutan yang dilihat pembeli di checkout. Transfer manual ditaruh
 * terakhir karena ia satu-satunya yang bukan gateway.
 */
const PAYMENT_TOGGLE_ORDER = [
  'payment.stripe.enabled',
  'payment.paypal.enabled',
  'payment.razorpay.enabled',
  'payment.paystack.enabled',
  'payment.flutterwave.enabled',
  'payment.mollie.enabled',
  'payment.midtrans.enabled',
  'payment.manual.enabled',
];

export function compareSettings(a: SettingItem, b: SettingItem): number {
  const ia = PAYMENT_TOGGLE_ORDER.indexOf(a.key);
  const ib = PAYMENT_TOGGLE_ORDER.indexOf(b.key);
  if (ia !== -1 && ib !== -1) return ia - ib;
  return 0; // di luar itu, biarkan urutan dari server
}

export function compareGroups(a: string, b: string): number {
  const ia = GROUP_ORDER.indexOf(a);
  const ib = GROUP_ORDER.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

/**
 * Setting yang nilainya dipilih dari daftar.
 *
 * Mata uang basis diambil dari master mata uang (tabel `currencies`), bukan dari
 * 159 kode ISO. Menawarkan seluruh ISO berarti basis bisa diarahkan ke mata uang
 * yang tidak punya baris kurs sama sekali — seluruh harga lalu tampil dengan
 * kode yang tidak dikenal siapa pun, tanpa apa pun di layar yang menjelaskan
 * sebabnya. Untuk memakai mata uang baru sebagai basis, tambahkan dulu di
 * halaman Mata Uang.
 */
const SELECT_OPTIONS: Record<string, () => SelectOption[]> = {
  'currency.code': () =>
    useCurrencyStore().list.map((c) => ({
      value: c.kode,
      label: `${c.kode} — ${c.nama}`,
      hint: c.is_basis ? undefined : `1 ${useCurrencyStore().base} = ${c.rate} ${c.kode}`,
    })),
};

export function selectOptions(key: string): SelectOption[] {
  return SELECT_OPTIONS[key]?.() ?? [];
}

/** Setting bertipe JSON yang punya editor khusus (bukan textarea JSON mentah). */
const STRUCTURED_JSON: Record<string, SettingControl> = {
  'komisi.tier_default': 'commissionTiers',
};

export function controlFor(item: SettingItem): SettingControl {
  if (SELECT_OPTIONS[item.key]) return 'select';
  if (item.key.toLowerCase().includes('pass')) return 'password';
  // Kredensial yang ditandai terenkripsi selalu jadi input password: nilainya
  // dibaca balik sebagai topeng, dan menampilkannya sebagai teks biasa membuat
  // orang mengira topeng itu isi sebenarnya lalu menghapusnya.
  if (item.is_encrypted) return 'password';
  if (item.tipe_nilai === 'json') return STRUCTURED_JSON[item.key] ?? 'json';
  if (item.tipe_nilai === 'boolean') return 'boolean';
  if (item.tipe_nilai === 'integer' || item.tipe_nilai === 'numeric') return 'number';
  return 'text';
}

/**
 * Satuan ditampilkan sebagai sufiks input (persen, menit, bulan, …).
 * Satuan `rupiah` dari seed lama diganti kode mata uang yang sedang aktif,
 * supaya labelnya tidak berbohong saat mata uang diubah.
 */
export function unitLabel(item: SettingItem, currency?: string): string {
  if (!item.satuan) return '';
  if (item.satuan === 'rupiah') return currency ?? '';
  const k = `settings.unit.${item.satuan}`;
  return te(k) ? t(k) : item.satuan;
}

// ── Tier komisi ────────────────────────────────────────────────────────────

export interface CommissionTier {
  kategori: string;
  rate: number;
}

/** Baca nilai JSON tier komisi; bentuk tak terduga dianggap daftar kosong. */
export function parseTiers(nilai: string): CommissionTier[] {
  try {
    const parsed = JSON.parse(nilai || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({ kategori: String(r.kategori ?? ''), rate: Number(r.rate ?? 0) }));
  } catch {
    return [];
  }
}

export function serializeTiers(tiers: CommissionTier[]): string {
  return JSON.stringify(
    tiers
      .filter((tier) => tier.kategori.trim())
      .map((tier) => ({ kategori: tier.kategori.trim(), rate: Number(tier.rate) || 0 })),
  );
}
