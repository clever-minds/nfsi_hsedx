import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Isi halaman publik yang dapat diubah admin tanpa deploy ulang.
 *
 * Satu baris = satu blok content (`kontak`, `sosial`, `menu`, `hero`,
 * `sections`, `footer`), bukan satu field. Alasannya: sebagian blok berisi
 * register yang panjangnya bebas (tautan sosmed, kolom footer, sort_order seksi),
 * dan memaksanya jadi pasangan key/value seperti tabel `settings` akan
 * melahirkan puluhan baris yang harus read bersamaan setiap kali halaman
 * depan digambar.
 *
 * grade bawaan no diseed di sini melainkan tinggal di kode
 * (`site-content.defaults.ts`) lalu ditimpa baris tabel ini. Dengan begitu
 * instalasi baru langsung tampil benar, dan field yang ditambahkan di rilis
 * berikutnya punya value bawaan tanpa perlu migrasi data.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS site_content (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key         text NOT NULL,
      value       jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS site_content_key_unique
      ON site_content (key) WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    DROP TRIGGER IF EXISTS set_updated_at ON site_content;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON site_content
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS site_content;`);
}
