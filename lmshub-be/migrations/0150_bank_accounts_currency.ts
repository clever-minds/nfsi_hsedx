import { MigrationBuilder } from 'node-pg-migrate';

/**
 * Tiga perubahan pada konfigurasi global:
 *
 * A. `bank_accounts` — account tujuan transfer manual naik from tiga baris `settings`
 * (bank.name / bank.account_number / bank.account_name) menjadi master data. Alasannya
 * satu: settings hanya bisa menyimpan SATU account, sedangkan lembaga lazim punya
 * beberapa (BCA + Mandiri, atau account terpisah per unit). Baris lama dipindahkan
 * apa adanya menjadi account pertama supaya checkout yang berjalan no kehilangan
 * tujuan transfer, lalu baris settings-nya dihapus.
 *
 * B. `currency.code` — mata uang tampilan dipilih di settings, bukan lagi hard-coded
 * 'IDR' di helper format. is_public karena catalog pra-login juga menampilkan price.
 *
 * C. `notification.default_channel` dihapus from settings. Kanal per-event sudah diatur di
 * Notifikasi → Preferensi (tabel event config), jadi baris ini duplikat yang
 * menyesatkan — dan satu-satunya isinya JSON mentah di layar settings.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── A. Master data account bank ──
  pgm.sql(`
    CREATE TABLE bank_accounts (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bank_name     text NOT NULL,
      account_number text NOT NULL,
      account_name     text NOT NULL,
      branch        text,
      notes       text,
      is_active      boolean NOT NULL DEFAULT true,
      is_primary      boolean NOT NULL DEFAULT false,
      sort_order        integer NOT NULL DEFAULT 0,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted_at    timestamptz
    );
  `);

  // Nomor account unik per bank (abaikan baris yang sudah dihapus).
  pgm.sql(`
    CREATE UNIQUE INDEX bank_accounts_unique
      ON bank_accounts (bank_name, account_number)
      WHERE deleted_at IS NULL;
  `);

  // Paling banyak satu account primary — checkout memakainya sebagai default.
  pgm.sql(`
    CREATE UNIQUE INDEX bank_accounts_one_primary
      ON bank_accounts (is_primary)
      WHERE is_primary AND deleted_at IS NULL;
  `);

  pgm.sql(`CREATE INDEX bank_accounts_active ON bank_accounts (is_active, sort_order) WHERE deleted_at IS NULL;`);

  pgm.sql(`
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON bank_accounts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // Pindahkan account yang sudah ada di settings agar checkout no kosong.
  pgm.sql(`
    INSERT INTO bank_accounts (bank_name, account_number, account_name, is_active, is_primary, sort_order)
    SELECT
      COALESCE(NULLIF((SELECT value FROM settings WHERE key = 'bank.name' AND deleted_at IS NULL), ''), 'Bank'),
      COALESCE(NULLIF((SELECT value FROM settings WHERE key = 'bank.account_number' AND deleted_at IS NULL), ''), '-'),
      COALESCE(NULLIF((SELECT value FROM settings WHERE key = 'bank.account_name' AND deleted_at IS NULL), ''), '-'),
      true, true, 0
    WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'bank.account_number' AND deleted_at IS NULL AND NULLIF(value, '') IS NOT NULL);
  `);

  pgm.sql(`DELETE FROM settings WHERE key IN ('bank.name', 'bank.account_number', 'bank.account_name');`);

  // ── B. Mata uang tampilan ──
  pgm.sql(`
    INSERT INTO settings (key, "group", label, value_type, value, unit, is_public, description) VALUES
      ('currency.code', 'currency', 'Mata Uang', 'string', 'IDR', NULL, true,
       'Mata uang untuk semua price yang ditampilkan')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  // ── C. Kanal notification diatur di Preferensi, bukan di sini ──
  pgm.sql(`DELETE FROM settings WHERE key = 'notification.default_channel';`);

  // ── Izin modul baru mengikuti `settings` (no ada modul RBAC baru) ──
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Kembalikan account primary to settings sebelum tabelnya dibuang.
  pgm.sql(`
    INSERT INTO settings (key, "group", label, value_type, value, unit, is_public, description)
    SELECT * FROM (
      SELECT 'bank.name' AS key, 'bank' AS group, 'name Bank' AS label, 'string' AS value_type,
             (SELECT bank_name FROM bank_accounts WHERE deleted_at IS NULL ORDER BY is_primary DESC, sort_order LIMIT 1) AS value,
             NULL::text AS unit, true AS is_public, 'name bank tujuan transfer manual' AS description
      UNION ALL
      SELECT 'bank.account_number', 'bank', 'Nomor Rekening', 'string',
             (SELECT account_number FROM bank_accounts WHERE deleted_at IS NULL ORDER BY is_primary DESC, sort_order LIMIT 1),
             NULL, true, 'Nomor account tujuan'
      UNION ALL
      SELECT 'bank.account_name', 'bank', 'Atas name', 'string',
             (SELECT account_name FROM bank_accounts WHERE deleted_at IS NULL ORDER BY is_primary DESC, sort_order LIMIT 1),
             NULL, true, 'name pemilik account'
    ) s
    WHERE s.value IS NOT NULL
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO settings (key, "group", label, value_type, value, unit, is_public, description) VALUES
      ('notification.default_channel', 'notification', 'Kanal Default Notifikasi', 'json', '["in_app","whatsapp"]', NULL, false,
       'Kanal default event (domain 10)')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);

  pgm.sql(`DELETE FROM settings WHERE key = 'currency.code';`);
  pgm.sql(`DROP TABLE IF EXISTS bank_accounts;`);
}
