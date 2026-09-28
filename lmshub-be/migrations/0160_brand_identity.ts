import { MigrationBuilder } from 'node-pg-migrate';

/**
 * Identitas merek — nama aplikasi, baris footer, logo, dan ikon browser.
 *
 * Semuanya `is_public` karena area pra-login (katalog, halaman masuk) juga
 * memakainya untuk menggambar dirinya sendiri.
 *
 * `lembaga.nama` dilebur ke `brand.nama_aplikasi`. Baris lama bertuliskan
 * "Nama brand" tetapi tidak pernah dibaca kode mana pun; menyisakannya di
 * samping nama aplikasi hanya membuat admin menebak-nebak mana yang berlaku.
 * Nilainya dibawa serta supaya nama yang sudah diisi tidak hilang.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, satuan, is_public, deskripsi) VALUES
      ('brand.nama_aplikasi', 'brand', 'Nama Aplikasi', 'string',
       COALESCE(
         NULLIF((SELECT nilai FROM settings WHERE key = 'lembaga.nama' AND deleted_at IS NULL), ''),
         'LMS Hub'
       ),
       NULL, true, 'Nama produk yang dilihat pengguna'),
      ('brand.footer', 'brand', 'Baris Footer', 'string', '', NULL, true,
       'Baris di bawah navigasi; :year jadi tahun berjalan dan :name jadi nama aplikasi'),
      ('brand.logo_url', 'brand', 'Logo', 'string', '', NULL, true,
       'Logo di sidebar dan halaman masuk'),
      ('brand.icon_url', 'brand', 'Ikon', 'string', '', NULL, true,
       'Ikon persegi untuk tab browser')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`DELETE FROM settings WHERE key = 'lembaga.nama';`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, satuan, is_public, deskripsi)
    SELECT 'lembaga.nama', 'kontak', 'Nama Lembaga', 'string',
           COALESCE((SELECT nilai FROM settings WHERE key = 'brand.nama_aplikasi' AND deleted_at IS NULL), 'LMS Hub'),
           NULL, true, 'Nama brand'
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`
    DELETE FROM settings
     WHERE key IN ('brand.nama_aplikasi', 'brand.footer', 'brand.logo_url', 'brand.icon_url');
  `);
}
