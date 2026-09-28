import 'dotenv/config';
import { z } from 'zod';

/**
 * Nilai bawaan khusus pengembangan. Dideklarasikan sebagai konstanta supaya
 * pemeriksaan di bawah tidak bisa lepas sinkron dari skema — kalau nilai di
 * sini diubah, guard-nya ikut.
 */
const DEV_ACCESS_SECRET = 'dev-access-secret';
const DEV_REFRESH_SECRET = 'dev-refresh-secret';

/**
 * Panjang minimum rahasia penandatangan di produksi.
 *
 * HS256 memakai kunci sepanjang apa pun yang diberikan, termasuk `abc`. Tanpa
 * batas bawah, sebuah instalasi bisa lolos guard "bukan nilai bawaan" dengan
 * rahasia yang tetap bisa ditebak dalam hitungan detik.
 */
export const MIN_SECRET_LENGTH = 32;

/**
 * Rahasia yang tidak pernah boleh dipakai di produksi.
 *
 * Mencocokkan nilai bawaan skema saja tidak cukup: pembeli menyalin
 * `.env.example`, dan berkas itu berisi teks pancingannya sendiri. Guard yang
 * hanya tahu nilai bawaan skema akan diam untuk setiap instalasi yang persis
 * mengikuti petunjuk pemasangan — persis kasus yang ingin dicegah.
 *
 * Daftar ini karena itu memuat nilai bawaan skema DAN setiap placeholder yang
 * pernah tercetak di `.env.example` maupun manual pemasangan.
 */
const SECRET_PLACEHOLDERS = new Set(
  [
    DEV_ACCESS_SECRET,
    DEV_REFRESH_SECRET,
    'dev-access-secret-ganti-di-produksi',
    'dev-refresh-secret-ganti-di-produksi',
    'change-me',
    'changeme',
    'ganti-saya',
    '__ganti__',
    '__replace__',
    'secret',
    'jwt-secret',
    'your-secret-here',
  ].map((v) => v.toLowerCase()),
);

/**
 * Potongan kata yang menandai sebuah nilai masih placeholder walau sudah
 * dipanjangkan — mis. `dev-access-secret-ganti-di-produksi-beneran`. Peluang
 * salah satunya muncul di dalam keluaran `randomBytes` dapat diabaikan.
 */
const SECRET_TELLTALES = [
  'dev-access-secret',
  'dev-refresh-secret',
  'change',
  'ganti',
  'replace',
  'placeholder',
  'your-secret',
  'example',
];

/**
 * Alasan sebuah rahasia ditolak, atau `null` bila layak pakai.
 * Hanya dipanggil saat `NODE_ENV=production` — pengembangan tetap jalan apa adanya.
 */
export function alasanRahasiaLemah(nilai: string): string | null {
  const v = nilai.trim();
  const lower = v.toLowerCase();

  if (SECRET_PLACEHOLDERS.has(lower)) return 'still set to the example/default value';
  for (const tell of SECRET_TELLTALES) {
    if (lower.includes(tell)) return `still contains the placeholder text "${tell}"`;
  }
  if (v.length < MIN_SECRET_LENGTH) {
    return `only ${v.length} characters (minimum ${MIN_SECRET_LENGTH})`;
  }
  // Menangkap "aaaaaaaa…" dan sejenisnya: panjang, tapi nyaris tanpa entropi.
  if (new Set(v).size < 8) return 'too few distinct characters (almost no entropy)';
  return null;
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // URL FE publik (untuk QR verifikasi sertifikat, link verifikasi email)
  PUBLIC_WEB_URL: z.string().default('http://localhost:5173'),

  // Email / SMTP (fallback env — konfigurasi utama via tabel settings, diatur super admin)
  EMAIL_FROM: z.string().default('LMS Hub <no-reply@lmshub.test>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Google OAuth (client id juga dapat diatur via settings)
  GOOGLE_CLIENT_ID: z.string().optional(),

  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/lmshub'),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().default(DEV_ACCESS_SECRET),
  JWT_REFRESH_SECRET: z.string().default(DEV_REFRESH_SECRET),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  BOOTSTRAP_ADMIN_EMAIL: z.string().default('admin@lmshub.test'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default('Admin12345!'),
  BOOTSTRAP_ADMIN_NAME: z.string().default('Super Admin'),

  // ── Payment gateways ───────────────────────────────────────────────
  // Every gateway is optional. A gateway with no credentials is simply not
  // offered at checkout, so a buyer only configures the ones they can use.

  // Midtrans (Indonesia)
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Stripe (global — cards, Apple Pay, Google Pay)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // PayPal (global)
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_IS_PRODUCTION: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Razorpay (India)
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Paystack (Nigeria, Ghana, South Africa)
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),

  // Flutterwave (pan-Africa)
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().optional(),

  // Mollie (Europe — iDEAL, Bancontact, SEPA)
  MOLLIE_API_KEY: z.string().optional(),

  // Where a hosted gateway sends the buyer back to. Both must be pages on the
  // storefront; they only display an outcome, they never settle an order.
  PAYMENT_RETURN_URL: z.string().optional(),
  PAYMENT_CANCEL_URL: z.string().optional(),

  // Auto-settle pembayaran TANPA gateway. Hanya untuk mencoba alur beli di
  // lokal; harus dinyalakan sendiri dan ditolak mentah-mentah di produksi
  // (lihat guard di bawah). Instalasi baru mendapat `false`, sehingga toko yang
  // belum mengonfigurasi gateway mana pun tidak membagikan kursus berbayar.
  PAYMENT_DEV_AUTOSETTLE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Penyimpanan objek (S3 dan kawan-kawan) BELUM diimplementasikan. Variabel
  // STORAGE_DRIVER / S3_* sengaja dihapus dari sini: mendeklarasikannya membuat
  // pembeli mengisi kredensial lalu menunggu sesuatu yang tidak pernah terjadi —
  // seluruh berkas tetap ditulis ke disk lokal di `uploads/`.
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Default the payment redirect pages to the storefront when unset.
  PAYMENT_RETURN_URL: parsed.data.PAYMENT_RETURN_URL || `${parsed.data.PUBLIC_WEB_URL}/payment/return`,
  PAYMENT_CANCEL_URL: parsed.data.PAYMENT_CANCEL_URL || `${parsed.data.PUBLIC_WEB_URL}/payment/cancel`,
};
export const isProd = env.NODE_ENV === 'production';

/**
 * Menolak start bila produksi memakai rahasia penandatangan yang lemah.
 *
 * Nilai bawaan dan placeholder tercetak di kode sumber yang dibeli semua orang,
 * jadi instalasi yang memakainya menandatangani token dengan kunci publik: siapa
 * pun yang punya salinan produk ini bisa menempa token admin untuk server itu.
 * Rahasia yang sangat pendek sama buruknya — ia bisa dibongkar offline.
 *
 * Wizard pemasangan membangkitkan rahasia acak, jadi yang terlindungi di sini
 * adalah pemasangan manual — pembeli yang menyalin `.env.example` lalu
 * melewatkan dua baris ini, atau mengisinya seadanya. Gagal saat start jauh
 * lebih baik daripada berjalan dengan tenang dalam keadaan bisa dibobol.
 */
if (isProd) {
  const lemah: string[] = [];
  const cek = (nama: string, nilai: string) => {
    const alasan = alasanRahasiaLemah(nilai);
    if (alasan) lemah.push(`   • ${nama} — ${alasan}`);
  };

  cek('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET);
  cek('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET);

  // Access dan refresh token punya masa hidup dan arti yang berbeda; satu kunci
  // untuk keduanya membuat refresh token yang bocor dapat dipakai sebagai access
  // token, dan sebaliknya.
  if (env.JWT_ACCESS_SECRET.trim() === env.JWT_REFRESH_SECRET.trim()) {
    lemah.push('   • JWT_ACCESS_SECRET and JWT_REFRESH_SECRET — identical; they must differ');
  }

  if (lemah.length) {
    console.error(
      '\n❌ Unsafe production signing secrets:\n' +
        `${lemah.join('\n')}\n\n` +
        '   Tokens on this server can be forged until the above is fixed.\n' +
        `   Set each one to a random value of at least ${MIN_SECRET_LENGTH} characters, e.g.:\n` +
        "     node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"\n",
    );
    process.exit(1);
  }

  // Auto-settle pembayaran adalah alat bantu pengembangan. Kalaupun sebuah
  // instalasi produksi mewarisi flag itu dari .env pengembangan, jangan jalan.
  if (env.PAYMENT_DEV_AUTOSETTLE) {
    console.error(
      '\n❌ PAYMENT_DEV_AUTOSETTLE is enabled with NODE_ENV=production.\n' +
        '   That flag settles orders without any money arriving, and is for local development only.\n' +
        '   Remove the line from .env before running a production server.\n',
    );
    process.exit(1);
  }
}
export const isTest = env.NODE_ENV === 'test';
