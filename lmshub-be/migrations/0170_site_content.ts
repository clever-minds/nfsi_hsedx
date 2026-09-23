import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Isi halaman publik yang dapat diubah admin tanpa deploy ulang.
 *
 * Satu baris = satu blok konten (`kontak`, `sosial`, `menu`, `hero`,
 * `sections`, `footer`), bukan satu field. Alasannya: sebagian blok berisi
 * daftar yang panjangnya bebas (tautan sosmed, kolom footer, urutan seksi),
 * dan memaksanya jadi pasangan key/value seperti tabel `settings` akan
 * melahirkan puluhan baris yang harus dibaca bersamaan setiap kali halaman
 * depan digambar.
 *
 * Nilai bawaan tidak diseed di sini melainkan tinggal di kode
 * (`site-content.defaults.ts`) lalu ditimpa baris tabel ini. Dengan begitu
 * instalasi baru langsung tampil benar, dan field yang ditambahkan di rilis
 * berikutnya punya nilai bawaan tanpa perlu migrasi data.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS site_content (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key         text NOT NULL,
      nilai       jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS site_content_key_unik
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
