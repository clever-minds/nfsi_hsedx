/**
 * Penjaga kredensial bootstrap super admin.
 *
 * Berkas terpisah, bukan bagian `src/scripts/seed.ts`, justru karena test perlu
 * memanggilnya: `seed.ts` menjalankan `main()` saat di-import, sehingga test yang
 * mengimpornya ikut menyalakan koneksi database. Logika murni tinggal di sini.
 */

/**
 * Potongan kata yang menandai sebuah kredensial masih berupa contoh.
 *
 * Membandingkan dengan satu literal ter-hardcode adalah yang gagal pada rahasia
 * JWT: `.env.example` disunting, konstanta pembandingnya tidak, dan guard-nya
 * diam justru untuk pembeli yang hendak dilindungi. Bentuk placeholder bertahan
 * terhadap penyuntingan berkas contoh; nilai literal tidak.
 */
const TELLTALES = ['change', 'ganti', 'replace', 'placeholder', 'example', 'lmshub.test', 'admin12345'];

/** Alasan sebuah kredensial bootstrap ditolak, atau `null` bila layak pakai. */
export function alasanKredensialBootstrapLemah(nilai: string): string | null {
  const v = nilai.trim().toLowerCase();
  for (const tell of TELLTALES) {
    if (v.includes(tell)) return `still contains the placeholder text "${tell}"`;
  }
  return null;
}
