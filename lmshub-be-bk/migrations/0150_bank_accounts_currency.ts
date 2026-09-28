import { MigrationBuilder } from 'node-pg-migrate';

/**
 * Tiga perubahan pada konfigurasi global:
 *
 * A. `bank_accounts` — rekening tujuan transfer manual naik dari tiga baris `settings`
 * (bank.nama / bank.nomor_rekening / bank.atas_nama) menjadi master data. Alasannya
 * satu: settings hanya bisa menyimpan SATU rekening, sedangkan lembaga lazim punya
 * beberapa (BCA + Mandiri, atau rekening terpisah per unit). Baris lama dipindahkan
 * apa adanya menjadi rekening pertama supaya checkout yang berjalan tidak kehilangan
 * tujuan transfer, lalu baris settings-nya dihapus.
 *
 * B. `currency.code` — mata uang tampilan dipilih di Pengaturan, bukan lagi hard-coded
 * 'IDR' di helper format. is_public karena katalog pra-login juga menampilkan harga.
 *
 * C. `notifikasi.default_kanal` dihapus dari settings. Kanal per-event sudah diatur di
 * Notifikasi → Preferensi (tabel event config), jadi baris ini duplikat yang
 * menyesatkan — dan satu-satunya isinya JSON mentah di layar Pengaturan.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── A. Master data rekening bank ──
  pgm.sql(`
    CREATE TABLE bank_accounts (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nama_bank     text NOT NULL,
      nomor_rekening text NOT NULL,
      atas_nama     text NOT NULL,
      cabang        text,
      catatan       text,
      is_aktif      boolean NOT NULL DEFAULT true,
      is_utama      boolean NOT NULL DEFAULT false,
      urutan        integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted_at    timestamptz
    );
  `);

  // Nomor rekening unik per bank (abaikan baris yang sudah dihapus).
  pgm.sql(`
    CREATE UNIQUE INDEX bank_accounts_unik
      ON bank_accounts (nama_bank, nomor_rekening)
      WHERE deleted_at IS NULL;
  `);

  // Paling banyak satu rekening utama — checkout memakainya sebagai default.
  pgm.sql(`
    CREATE UNIQUE INDEX bank_accounts_satu_utama
      ON bank_accounts (is_utama)
      WHERE is_utama AND deleted_at IS NULL;
  `);

  pgm.sql(`CREATE INDEX bank_accounts_aktif ON bank_accounts (is_aktif, urutan) WHERE deleted_at IS NULL;`);

  pgm.sql(`
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON bank_accounts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // Pindahkan rekening yang sudah ada di settings agar checkout tidak kosong.
  pgm.sql(`
    INSERT INTO bank_accounts (nama_bank, nomor_rekening, atas_nama, is_aktif, is_utama, urutan)
    SELECT
      COALESCE(NULLIF((SELECT nilai FROM settings WHERE key = 'bank.nama' AND deleted_at IS NULL), ''), 'Bank'),
      COALESCE(NULLIF((SELECT nilai FROM settings WHERE key = 'bank.nomor_rekening' AND deleted_at IS NULL), ''), '-'),
      COALESCE(NULLIF((SELECT nilai FROM settings WHERE key = 'bank.atas_nama' AND deleted_at IS NULL), ''), '-'),
      true, true, 0
    WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'bank.nomor_rekening' AND deleted_at IS NULL AND NULLIF(nilai, '') IS NOT NULL);
  `);

  pgm.sql(`DELETE FROM settings WHERE key IN ('bank.nama', 'bank.nomor_rekening', 'bank.atas_nama');`);

  // ── B. Mata uang tampilan ──
  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, satuan, is_public, deskripsi) VALUES
      ('currency.code', 'currency', 'Mata Uang', 'string', 'IDR', NULL, true,
       'Mata uang untuk semua harga yang ditampilkan')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  // ── C. Kanal notifikasi diatur di Preferensi, bukan di sini ──
  pgm.sql(`DELETE FROM settings WHERE key = 'notifikasi.default_kanal';`);

  // ── Izin modul baru mengikuti `pengaturan` (tidak ada modul RBAC baru) ──
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Kembalikan rekening utama ke settings sebelum tabelnya dibuang.
  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, satuan, is_public, deskripsi)
    SELECT * FROM (
      SELECT 'bank.nama' AS key, 'bank' AS grup, 'Nama Bank' AS label, 'string' AS tipe_nilai,
             (SELECT nama_bank FROM bank_accounts WHERE deleted_at IS NULL ORDER BY is_utama DESC, urutan LIMIT 1) AS nilai,
             NULL::text AS satuan, true AS is_public, 'Nama bank tujuan transfer manual' AS deskripsi
      UNION ALL
      SELECT 'bank.nomor_rekening', 'bank', 'Nomor Rekening', 'string',
             (SELECT nomor_rekening FROM bank_accounts WHERE deleted_at IS NULL ORDER BY is_utama DESC, urutan LIMIT 1),
             NULL, true, 'Nomor rekening tujuan'
      UNION ALL
      SELECT 'bank.atas_nama', 'bank', 'Atas Nama', 'string',
             (SELECT atas_nama FROM bank_accounts WHERE deleted_at IS NULL ORDER BY is_utama DESC, urutan LIMIT 1),
             NULL, true, 'Nama pemilik rekening'
    ) s
    WHERE s.nilai IS NOT NULL
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, satuan, is_public, deskripsi) VALUES
      ('notifikasi.default_kanal', 'notifikasi', 'Kanal Default Notifikasi', 'json', '["in_app","whatsapp"]', NULL, false,
       'Kanal default event (domain 10)')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`DELETE FROM settings WHERE key = 'currency.code';`);
  pgm.sql(`DROP TABLE IF EXISTS bank_accounts;`);
}
