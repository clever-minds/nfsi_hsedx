/**
 * Metadata layar settings.
 *
 * Backend menyimpan label & description setting dalam satu language (Indonesia).
 * Modul ini memetakan tiap `key` to kunci i18n, sehingga layar settings ikut
 * berganti language seperti layar lain — sambil tetap memakai label from backend
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
  group?: string;
  value: string;
  label?: string;
  value_type?: string;
  unit?: string | null;
  is_public?: boolean;
  /** Rahasia: read balik sebagai topeng, no pernah value aslinya. */
  is_encrypted?: boolean;
  description?: string;
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

/** Label setting — terjemahan bila ada, kalau no pakai label from backend. */
export function settingLabel(item: SettingItem): string {
  const k = `settings.item.${keyId(item.key)}.label`;
  return te(k) ? t(k) : item.label || item.key;
}

/** description setting — terjemahan bila ada, kalau no from backend. */
export function settingDescription(item: SettingItem): string {
  const k = `settings.item.${keyId(item.key)}.desc`;
  return te(k) ? t(k) : item.description || '';
}

/** name group — terjemahan bila ada, kalau no kode group yang dirapikan. */
export function groupLabel(group: string): string {
  const k = `settings.group.${group}`;
  return te(k) ? t(k) : group.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Setting yang sudah dipensiunkan dan no read kode mana pun lagi.
 *
 * Migrasi 0150 menghapus barisnya from database, tapi instalasi yang belum
 * dimigrasi masih akan mengirimkannya lewat `GET /settings`. Menampilkannya
 * lebih buruk daripada menyembunyikannya: admin akan mengira sedang mengubah
 * sesuatu, padahal no ada yang membaca nilainya.
 *
 *  - `notification.default_channel` → channel per-event diatur di Notifikasi › Preferensi
 *  - `bank.*`                   → pindah to master data Rekening Bank
 *  - `institution.name`             → dilebur to `brand.app_name`
 */
const RETIRED_KEYS = new Set([
  'notification.default_channel',
  'bank.name',
  'bank.account_number',
  'bank.account_name',
  'institution.name',
]);

export function isRetired(item: SettingItem): boolean {
  return RETIRED_KEYS.has(item.key);
}

/**
 * Urutan tampil group. Yang paling sering disentuh admin ditaruh di on;
 * group di luar register ini muncul setelahnya, sort_order abjad.
 */
const GROUP_ORDER = [
  'brand',
  'currency',
  'price',
  'checkout',
  // Payment tepat setelah checkout: satu group sakelar, lalu satu group
  // kredensial per gateway — sort_orderannya sama dengan sort_order di layar checkout.
  'payment',
  'payment_stripe',
  'payment_paypal',
  'payment_razorpay',
  'payment_easebuzz',
  'payment_paystack',
  'payment_flutterwave',
  'payment_mollie',
  'payment_midtrans',
  'commission',
  'revenue_share',
  'certificate',
  'kontak',
  'auth',
  'smtp',
];

/**
 * Urutan item di dalam satu group.
 *
 * Hanya dibutuhkan untuk sakelar gateway: server mengembalikannya sort_order abjad,
 * sehingga Flutterwave muncul sebelum Stripe dan register sakelar no
 * menyerupai sort_order yang dilihat pembeli di checkout. Transfer manual ditaruh
 * terakhir karena ia satu-satunya yang bukan gateway.
 */
const PAYMENT_TOGGLE_ORDER = [
  'payment.stripe.enabled',
  'payment.paypal.enabled',
  'payment.razorpay.enabled',
  'payment.easebuzz.enabled',
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
  return 0; // di luar itu, biarkan sort_order from server
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
 * Setting yang nilainya dipilih from register.
 *
 * Mata uang basis diambil from master mata uang (tabel `currencies`), bukan from
 * 159 kode ISO. Menawarkan seluruh ISO berarti basis bisa diarahkan to mata uang
 * yang no punya baris kurs sama sekali — seluruh price lalu tampil dengan
 * kode yang no dikenal siapa pun, tanpa apa pun di layar yang menjelaskan
 * sebabnya. Untuk memakai mata uang baru sebagai basis, add dulu di
 * halaman Mata Uang.
 */
const SELECT_OPTIONS: Record<string, () => SelectOption[]> = {
  'currency.code': () =>
    useCurrencyStore().list.map((c) => ({
      value: c.kode,
      label: `${c.kode} — ${c.name}`,
      hint: c.is_basis ? undefined : `1 ${useCurrencyStore().base} = ${c.rate} ${c.kode}`,
    })),
};

export function selectOptions(key: string): SelectOption[] {
  return SELECT_OPTIONS[key]?.() ?? [];
}

/** Setting bertipe JSON yang punya editor khusus (bukan textarea JSON mentah). */
const STRUCTURED_JSON: Record<string, SettingControl> = {
  'commission.tier_default': 'commissionTiers',
};

export function controlFor(item: SettingItem): SettingControl {
  if (SELECT_OPTIONS[item.key]) return 'select';
  if (item.key.toLowerCase().includes('pass')) return 'password';
  // Kredensial yang ditandai terenkripsi selalu jadi input password: nilainya
  // read balik sebagai topeng, dan menampilkannya sebagai text biasa membuat
  // orang mengira topeng itu content sebenarnya lalu menghapusnya.
  if (item.is_encrypted) return 'password';
  if (item.value_type === 'json') return STRUCTURED_JSON[item.key] ?? 'json';
  if (item.value_type === 'boolean') return 'boolean';
  if (item.value_type === 'integer' || item.value_type === 'numeric') return 'number';
  return 'text';
}

/**
 * Satuan ditampilkan sebagai sufiks input (persen, menit, month, …).
 * Satuan `rupiah` from seed lama diganti kode mata uang yang sedang active,
 * supaya labelnya no berbohong saat mata uang diubah.
 */
export function unitLabel(item: SettingItem, currency?: string): string {
  if (!item.unit) return '';
  if (item.unit === 'rupiah') return currency ?? '';
  const k = `settings.unit.${item.unit}`;
  return te(k) ? t(k) : item.unit;
}

// ── Tier commission ────────────────────────────────────────────────────────────

export interface CommissionTier {
  category: string;
  rate: number;
}

/** Baca value JSON tier commission; bentuk tak terduga dianggap register kosong. */
export function parseTiers(value: string): CommissionTier[] {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({ category: String(r.category ?? ''), rate: Number(r.rate ?? 0) }));
  } catch {
    return [];
  }
}

export function serializeTiers(tiers: CommissionTier[]): string {
  return JSON.stringify(
    tiers
      .filter((tier) => tier.category.trim())
      .map((tier) => ({ category: tier.category.trim(), rate: Number(tier.rate) || 0 })),
  );
}
