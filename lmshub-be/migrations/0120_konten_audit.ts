/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 12 — Konten & Audit (F3/F11)
 * content_pages, settings, audit_log.
 *
 * Catatan `audit_log`: kolom mengikuti kontrak `recordAudit()` di `src/core/audit/audit.ts`
 * (INSERT INTO audit_log (user_id, module, action, entity, entity_id, nilai_lama, nilai_baru, alasan)) —
 * nama kolom `module`/`action`/`entity` dipakai persis (bukan `modul`/`aksi`/`entity_type` seperti draf
 * rencana awal) agar konsisten dengan kode aplikasi yang sudah ada.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE content_page_tipe AS ENUM ('tentang','faq','kebijakan','halaman');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE content_page_status AS ENUM ('draft','terbit','arsip');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── content_pages ──
  pgm.sql(`
    CREATE TABLE content_pages (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug                citext NOT NULL,
      judul               varchar(200) NOT NULL,
      konten              jsonb,
      tipe                content_page_tipe NOT NULL DEFAULT 'halaman',
      status              content_page_status NOT NULL DEFAULT 'draft',
      meta_seo            jsonb,
      dikelola_oleh       uuid REFERENCES users(id) ON DELETE SET NULL,
      tanggal_terbit      timestamptz,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT content_pages_terbit_chk CHECK (status <> 'terbit' OR tanggal_terbit IS NOT NULL)
    );
    CREATE UNIQUE INDEX content_pages_slug_uq ON content_pages (slug) WHERE deleted_at IS NULL;
    CREATE INDEX content_pages_tipe_idx ON content_pages (tipe);
    CREATE INDEX content_pages_status_idx ON content_pages (status);
    CREATE INDEX content_pages_dikelola_oleh_idx ON content_pages (dikelola_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON content_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── settings ──
  pgm.sql(`
    CREATE TABLE settings (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key             citext NOT NULL,
      grup            varchar(50) NOT NULL DEFAULT 'umum',
      label           varchar(150) NOT NULL,
      tipe_nilai      varchar(20) NOT NULL DEFAULT 'string',
      nilai           text,
      nilai_json      jsonb,
      satuan          varchar(30),
      deskripsi       text,
      is_public       boolean NOT NULL DEFAULT false,
      is_editable     boolean NOT NULL DEFAULT true,
      is_encrypted    boolean NOT NULL DEFAULT false,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz,
      CONSTRAINT settings_tipe_nilai_chk CHECK (tipe_nilai IN ('string','integer','numeric','boolean','json'))
    );
    CREATE UNIQUE INDEX settings_key_uq ON settings (key) WHERE deleted_at IS NULL;
    CREATE INDEX settings_grup_idx ON settings (grup);
    CREATE INDEX settings_nilai_json_gin_idx ON settings USING GIN (nilai_json);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── audit_log — append-only / immutable (kontrak recordAudit()) ──
  pgm.sql(`
    CREATE TABLE audit_log (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
      module        varchar(60) NOT NULL,
      action        varchar(40) NOT NULL,
      entity        varchar(80),
      entity_id     uuid,
      nilai_lama    jsonb,
      nilai_baru    jsonb,
      alasan        text,
      created_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT audit_log_entity_pair_chk CHECK (
        (entity IS NULL AND entity_id IS NULL) OR (entity IS NOT NULL AND entity_id IS NOT NULL)
      )
    );
    CREATE INDEX audit_log_user_idx ON audit_log (user_id);
    CREATE INDEX audit_log_module_idx ON audit_log (module);
    CREATE INDEX audit_log_action_idx ON audit_log (action);
    CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
    CREATE INDEX audit_log_created_at_idx ON audit_log (created_at);
  `);
  // Immutability: tanpa trigger set_updated_at (tidak ada updated_at/deleted_at) — baris hanya boleh
  // di-INSERT. Trigger penolak UPDATE/DELETE dipasang agar immutability berlaku terlepas dari
  // kepemilikan tabel (REVOKE saja tidak berlaku bagi owner tabel).
  pgm.sql(`
    CREATE OR REPLACE FUNCTION audit_log_block_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log bersifat append-only: UPDATE/DELETE tidak diizinkan';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER audit_log_block_update
      BEFORE UPDATE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

    CREATE TRIGGER audit_log_block_delete
      BEFORE DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
  `);

  // ── seed halaman publik awal ──
  pgm.sql(`
    INSERT INTO content_pages (slug, judul, tipe, status) VALUES
      ('tentang-kami', 'Tentang Kami', 'tentang', 'draft'),
      ('faq', 'Pertanyaan Umum (FAQ)', 'faq', 'draft'),
      ('kebijakan-privasi', 'Kebijakan Privasi', 'kebijakan', 'draft'),
      ('syarat-ketentuan', 'Syarat & Ketentuan', 'kebijakan', 'draft')
    ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING;
  `);

  // ── seed parameter global settings ──
  pgm.sql(`
    INSERT INTO settings (key, grup, label, tipe_nilai, nilai, satuan, is_public, deskripsi) VALUES
      ('harga.default_kursus', 'harga', 'Harga Default Kursus', 'integer', '500000', 'rupiah', false, 'Harga default kursus baru'),
      ('revenue_share.instruktur_default', 'revenue_share', 'Porsi Instruktur Default', 'numeric', '60', 'persen', false, 'Porsi instruktur default'),
      ('revenue_share.lembaga_default', 'revenue_share', 'Porsi Lembaga Default', 'numeric', '40', 'persen', false, 'Porsi lembaga default'),
      ('komisi.tier_default', 'komisi', 'Tier Komisi Default', 'json', '[{"kategori":"mahasiswa","rate":20},{"kategori":"profesional","rate":20}]', 'persen', false, 'Tier komisi per kategori marketing'),
      ('checkout.timeout_menit', 'checkout', 'Timeout Checkout', 'integer', '60', 'menit', false, 'Batas pembayaran gateway sebelum order kedaluwarsa'),
      ('dp.persen_minimal', 'harga', 'DP Minimal', 'numeric', '30', 'persen', false, 'DP minimal untuk skema cicilan'),
      ('cicilan.tenor_maks_bulan', 'harga', 'Tenor Cicilan Maksimum', 'integer', '12', 'bulan', false, 'Tenor cicilan maksimum'),
      ('sertifikat.syarat_progres_min_persen', 'sertifikat', 'Syarat Progres Minimum', 'numeric', '100', 'persen', false, 'Syarat progres kelulusan default'),
      ('sertifikat.syarat_passing_score_min', 'sertifikat', 'Syarat Passing Score Minimum', 'numeric', '70', 'poin', false, 'Syarat nilai kelulusan default'),
      ('sertifikat.syarat_kehadiran_min_persen', 'sertifikat', 'Syarat Kehadiran Minimum', 'numeric', '0', 'persen', false, 'Syarat kehadiran live class (0 = tidak wajib)'),
      ('kontak.nomor_wa_admin', 'kontak', 'Nomor WA Admin', 'string', '6281200000000', NULL, true, 'Nomor WA chat admin (area pra-login)'),
      -- example.com dicadangkan IANA, jadi jelas terbaca sebagai placeholder dan
      -- tidak pernah menunjuk alamat sungguhan milik siapa pun.
      ('kontak.email_cs', 'kontak', 'Email Layanan', 'string', 'support@example.com', NULL, true, 'Email layanan'),
      ('notifikasi.default_kanal', 'notifikasi', 'Kanal Default Notifikasi', 'json', '["in_app","whatsapp"]', NULL, false, 'Kanal default event (domain 10)'),
      ('lembaga.nama', 'kontak', 'Nama Lembaga', 'string', 'LMS Hub', NULL, true, 'Nama brand'),
      -- SMTP (diatur super admin; pass sensitif — jangan is_public)
      ('smtp.host', 'smtp', 'SMTP Host', 'string', '', NULL, false, 'Host server SMTP (mis. smtp.gmail.com)'),
      ('smtp.port', 'smtp', 'SMTP Port', 'integer', '587', NULL, false, 'Port SMTP (587 STARTTLS / 465 SSL)'),
      ('smtp.secure', 'smtp', 'SMTP Secure (SSL)', 'boolean', 'false', NULL, false, 'true untuk port 465 (SSL langsung)'),
      ('smtp.user', 'smtp', 'SMTP Username', 'string', '', NULL, false, 'Username/email akun SMTP'),
      ('smtp.pass', 'smtp', 'SMTP Password', 'string', '', NULL, false, 'Password/app-password SMTP (sensitif — FE menyamarkan input)'),
      ('smtp.from', 'smtp', 'Email Pengirim', 'string', 'LMS Hub <no-reply@lmshub.test>', NULL, false, 'Alamat From email keluar'),
      -- Rekening transfer bank manual (public agar tampil di checkout)
      ('bank.nama', 'bank', 'Nama Bank', 'string', 'BCA', NULL, true, 'Nama bank tujuan transfer manual'),
      ('bank.nomor_rekening', 'bank', 'Nomor Rekening', 'string', '1234567890', NULL, true, 'Nomor rekening tujuan'),
      ('bank.atas_nama', 'bank', 'Atas Nama', 'string', 'Yayasan LMS Hub', NULL, true, 'Nama pemilik rekening'),
      -- Google OAuth (client id boleh public)
      ('google.client_id', 'auth', 'Google Client ID', 'string', '', NULL, true, 'OAuth Client ID untuk login Google')
    ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS audit_log;`);
  pgm.sql(`DROP FUNCTION IF EXISTS audit_log_block_mutation();`);
  pgm.sql(`DROP TABLE IF EXISTS settings;`);
  pgm.sql(`DROP TABLE IF EXISTS content_pages;`);
  pgm.sql(`DROP TYPE IF EXISTS content_page_status;`);
  pgm.sql(`DROP TYPE IF EXISTS content_page_tipe;`);
}
