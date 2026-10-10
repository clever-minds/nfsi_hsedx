import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { alasanRahasiaLemah, MIN_SECRET_LENGTH } from '../../src/core/config/env';
import { paySchema, verifyPaymentSchema } from '../../src/modules/orders/orders.validation';
import { bolehMemberiPeran } from '../../src/modules/users/users.service';
import { alasanKredensialBootstrapLemah } from '../../src/core/config/bootstrap-credentials';
import { TIPE_HARGA_DARI_KLIEN, priceSepenuhnyaDariKatalog } from '../../src/modules/orders/orders.service';

/**
 * Pagar yang ditambahkan setelah tinjauan keamanan CodeCanyon (Agustus 2026).
 * Ketiganya pernah bocor dengan cara yang sama: aturannya ada, tapi no ada
 * apa pun yang menahannya tetap benar ketika berkas di sebelahnya berubah.
 */

describe('rahasia penandatangan produksi', () => {
  it('menolak value bawaan pengembangan', () => {
    expect(alasanRahasiaLemah('dev-access-secret')).not.toBeNull();
    expect(alasanRahasiaLemah('dev-refresh-secret')).not.toBeNull();
  });

  /**
   * Kegagalan aslinya: guard membandingkan dengan value bawaan skema, sedangkan
   * `.env.example` berisi text yang berbeda. Setiap pembeli yang menyalin berkas
   * contoh — persis yang diperintahkan panduan pemasangan — lolos tanpa suara.
   * Test ini membaca `.env.example` yang sungguhan, jadi ia ikut failed kalau
   * suatu saat berkas itu diedit menjadi sesuatu yang lolos lagi.
   */
  it('menolak setiap value yang tercetak di .env.example', () => {
    const contoh = readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
    const value = contoh
      .split('\n')
      .map((l) => l.match(/^\s*(JWT_ACCESS_SECRET|JWT_REFRESH_SECRET)\s*=\s*(.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[2].trim());

    expect(value.length).toBe(2);
    for (const v of value) expect(alasanRahasiaLemah(v)).not.toBeNull();
  });

  it('menolak rahasia yang terlalu pendek', () => {
    expect(alasanRahasiaLemah('x')).not.toBeNull();
    expect(alasanRahasiaLemah('a'.repeat(MIN_SECRET_LENGTH - 1))).not.toBeNull();
  });

  it('menolak value panjang tapi nyaris tanpa entropi', () => {
    expect(alasanRahasiaLemah('a'.repeat(64))).not.toBeNull();
  });

  it('menerima rahasia acak yang layak', () => {
    expect(alasanRahasiaLemah('kFq7Zb2NnR4tW9sYv1LpXcJd6HgMeA0uBiTlOrSzQ')).toBeNull();
  });
});

describe('POST /orders/:id/pay — hanya method luar-jaringan', () => {
  /**
   * Keempat method ini dulu diterima di sini dan langsung ditandai
   * "terverifikasi" sebagai simulasi gateway, sehingga siapa pun yang boleh
   * membuat order dapat melunasinya sendiri tanpa membayar.
   */
  it.each(['va', 'e_wallet', 'kartu', 'qris'])('menolak method gateway %s', (method) => {
    const r = paySchema.safeParse({ type: 'full', amount: 100_000, method });
    expect(r.success).toBe(false);
  });

  it.each(['transfer_bank', 'tunai', 'other'])('menerima method luar-jaringan %s', (method) => {
    const r = paySchema.safeParse({ type: 'full', amount: 100_000, method });
    expect(r.success).toBe(true);
  });
});

describe('POST /orders/:id/verify', () => {
  it('menerima payload layar Transaction (tanpa payment_id)', () => {
    const r = verifyPaymentSchema.safeParse({ action: 'verify' });
    expect(r.success).toBe(true);
  });

  it('tetap menerima payment_id eksplisit', () => {
    const r = verifyPaymentSchema.safeParse({
      payment_id: '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b',
      action: 'reject',
      notes_verifikasi: 'proof no cocok',
    });
    expect(r.success).toBe(true);
  });
});

describe('tangga peran — PUT /users/:id { role_kode }', () => {
  // roles.level pada seed: super_admin 0, direktur 1, ketua 2, pembina 3,
  // admin_ops 4, instructor 5, asisten 6, marketing 7, student 8, sub_user 9.
  const ADMIN_OPS = 4;

  it.each([
    ['super_admin', 0],
    ['director', 1],
    ['operations_admin', 4],
  ])('admin_ops no bisa memberikan peran %s', (_kode, level) => {
    expect(bolehMemberiPeran(ADMIN_OPS, level)).toBe(false);
  });

  it.each([
    ['instructor', 5],
    ['marketing', 7],
    ['student', 8],
  ])('admin_ops boleh memberikan peran %s', (_kode, level) => {
    expect(bolehMemberiPeran(ADMIN_OPS, level)).toBe(true);
  });
});

describe('order bernilai nol — course gratis & kupon potong-habis', () => {
  const item = (t: string, extra: Record<string, unknown> = {}) => ({
    item_type: t as 'course' | 'bundle' | 'path' | 'subscription',
    quantity: 1,
    ...extra,
  });

  it.each(['course', 'bundle', 'path'])('price %s diturunkan server from catalog', (t) => {
    expect(priceSepenuhnyaDariKatalog([item(t)])).toBe(true);
  });

  /**
   * Cabang `langganan` di resolveItems() memakai `item.price_unit` yang datang
   * from request. Kalau type itu until lolos, pembeli bisa mengirim satu baris
   * langganan berprice 0 dan mencetak order lunas on kemauannya sendiri.
   */
  it('price langganan dipasok klien, jadi total nol no boleh dipercaya', () => {
    expect(priceSepenuhnyaDariKatalog([item('subscription', { price_unit: 0 })])).toBe(false);
  });

  it('satu item berprice-klien mencemari seluruh keranjang', () => {
    expect(priceSepenuhnyaDariKatalog([item('course'), item('subscription', { price_unit: 0 })])).toBe(false);
  });

  /**
   * Penjaga sinkronisasi. Bila kelak ada type item baru yang pricenya dipasok
   * klien, ia harus terdaftar di TIPE_HARGA_DARI_KLIEN — test ini failed kalau
   * himpunannya berubah tanpa reason, dan mengingatkan untuk memeriksa ulang
   * resolveItems().
   */
  it('hanya langganan yang pricenya dipasok klien', () => {
    expect([...TIPE_HARGA_DARI_KLIEN]).toEqual(['subscription']);
  });
});

/**
 * Kredensial bootstrap super admin.
 *
 * Guard aslinya membandingkan dua literal ter-hardcode (`Admin12345!`,
 * `admin@lmshub.test`). Ketika `.env.example` diterjemahkan to Inggris, kedua
 * literal itu no lagi cocok dengan apa pun — guard-nya diam, dan pembeli yang
 * menyalin berkas contoh mendapat super admin berkata sandi yang tercetak di
 * dalam produk. Kegagalan yang sama persis dengan rahasia JWT.
 *
 * Karena itu test ini membaca `.env.example` yang sungguhan, bukan konstanta.
 */
describe('kredensial bootstrap super admin', () => {
  it('menolak setiap value yang tercetak di .env.example', () => {
    const contoh = readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
    const value = contoh
      .split('\n')
      .map((l) => l.match(/^\s*(BOOTSTRAP_ADMIN_EMAIL|BOOTSTRAP_ADMIN_PASSWORD)\s*=\s*(.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[2].trim());

    expect(value.length).toBe(2);
    for (const v of value) expect(alasanKredensialBootstrapLemah(v)).not.toBeNull();
  });

  it('menolak kredensial contoh yang lama, agar .env warisan tetap tertangkap', () => {
    expect(alasanKredensialBootstrapLemah('Admin12345!')).not.toBeNull();
    expect(alasanKredensialBootstrapLemah('admin@lmshub.test')).not.toBeNull();
  });

  it('menerima kredensial sungguhan', () => {
    expect(alasanKredensialBootstrapLemah('owner@akademisaya.id')).toBeNull();
    expect(alasanKredensialBootstrapLemah('7Kd!qmZr2vLpX9tb')).toBeNull();
  });
});
