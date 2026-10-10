import { MigrationBuilder } from 'node-pg-migrate';

/**
 * Identitas merek — name aplikasi, baris footer, logo, dan ikon browser.
 *
 * Semuanya `is_public` karena area pra-login (catalog, halaman login) juga
 * memakainya untuk menggambar dirinya sendiri.
 *
 * `institution.name` dilebur to `brand.app_name`. Baris lama bertuliskan
 * "name brand" tetapi no pernah read kode mana pun; menyisakannya di
 * samping name aplikasi hanya membuat admin menebak-nebak mana yang valid.
 * Nilainya dibawa serta supaya name yang sudah diisi no hilang.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO settings (key, "group", label, value_type, value, unit, is_public, description) VALUES
      ('brand.app_name', 'brand', 'name Aplikasi', 'string',
       COALESCE(
         NULLIF((SELECT value FROM settings WHERE key = 'institution.name' AND deleted_at IS NULL), ''),
         'LMS Hub'
       ),
       NULL, true, 'name produk yang dilihat user'),
      ('brand.footer', 'brand', 'Baris Footer', 'string', '', NULL, true,
       'Baris di bawah navigasi; :year jadi year berjalan dan :name jadi name aplikasi'),
      ('brand.logo_url', 'brand', 'Logo', 'string', '', NULL, true,
       'Logo di sidebar dan halaman login'),
      ('brand.icon_url', 'brand', 'Ikon', 'string', '', NULL, true,
       'Ikon persegi untuk tab browser')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`DELETE FROM settings WHERE key = 'institution.name';`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO settings (key, "group", label, value_type, value, unit, is_public, description)
    SELECT 'institution.name', 'kontak', 'name Lembaga', 'string',
           COALESCE((SELECT value FROM settings WHERE key = 'brand.app_name' AND deleted_at IS NULL), 'LMS Hub'),
           NULL, true, 'name brand'
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`
    DELETE FROM settings
     WHERE key IN ('brand.app_name', 'brand.footer', 'brand.logo_url', 'brand.icon_url');
  `);
}
