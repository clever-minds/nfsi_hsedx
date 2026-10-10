/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 12 — Konten & Audit (F3/F11)
 * content_pages, settings, audit_log.
 *
 * Catatan `audit_log`: kolom mengikuti kontrak `recordAudit()` di `src/core/audit/audit.ts`
 * (INSERT INTO audit_log (user_id, module, action, entity, entity_id, old_value, new_value, reason)) —
 * name kolom `module`/`action`/`entity` dipakai persis (bukan `modul`/`action`/`entity_type` seperti draf
 * rencana awal) agar konsisten dengan kode aplikasi yang sudah ada.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE content_page_type AS ENUM ('about','faq','policy','page');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE content_page_status AS ENUM ('draft','publish','archived');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── content_pages ──
  pgm.sql(`
    CREATE TABLE content_pages (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug                citext NOT NULL,
      title               varchar(200) NOT NULL,
      content              jsonb,
      type                content_page_type NOT NULL DEFAULT 'page',
      status              content_page_status NOT NULL DEFAULT 'draft',
      meta_seo            jsonb,
      managed_by       uuid REFERENCES users(id) ON DELETE SET NULL,
      publish_date      timestamptz,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT content_pages_publish_chk CHECK (status <> 'publish' OR publish_date IS NOT NULL)
    );
    CREATE UNIQUE INDEX content_pages_slug_uq ON content_pages (slug) WHERE deleted_at IS NULL;
    CREATE INDEX content_pages_type_idx ON content_pages (type);
    CREATE INDEX content_pages_status_idx ON content_pages (status);
    CREATE INDEX content_pages_managed_by_idx ON content_pages (managed_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON content_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── settings ──
  pgm.sql(`
      CREATE TABLE settings (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key             citext NOT NULL,
        "group"         varchar(50) NOT NULL DEFAULT 'umum',
        label           varchar(150) NOT NULL,
        value_type      varchar(20) NOT NULL DEFAULT 'string',
        value           text,
        value_json      jsonb,
      unit          varchar(30),
      description       text,
      is_public       boolean NOT NULL DEFAULT false,
      is_editable     boolean NOT NULL DEFAULT true,
      is_encrypted    boolean NOT NULL DEFAULT false,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz,
      CONSTRAINT settings_type_value_chk CHECK (value_type IN ('string','integer','numeric','boolean','json'))
    );
    CREATE UNIQUE INDEX settings_key_uq ON settings (key) WHERE deleted_at IS NULL;
    CREATE INDEX settings_group_idx ON settings ("group");
    CREATE INDEX settings_value_json_gin_idx ON settings USING GIN (value_json);
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
      old_value    jsonb,
      new_value    jsonb,
      reason        text,
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
  // Immutability: tanpa trigger set_updated_at (no ada updated_at/deleted_at) — baris hanya boleh
  // di-INSERT. Trigger penolak UPDATE/DELETE dipasang agar immutability valid terlepas from
  // kepemilikan tabel (REVOKE saja no valid bagi owner tabel).
  pgm.sql(`
    CREATE OR REPLACE FUNCTION audit_log_block_mutation()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log bersifat append-only: UPDATE/DELETE no diizinkan';
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
    INSERT INTO content_pages (slug, title, type, status) VALUES
      ('tentang-kami', 'Tentang Kami', 'about', 'draft'),
      ('faq', 'Pertanyaan Umum (FAQ)', 'faq', 'draft'),
      ('kebijakan-privasi', 'Kebijakan Privasi', 'policy', 'draft'),
      ('syarat-ketentuan', 'Syarat & Ketentuan', 'policy', 'draft')
    ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING;
  `);

  // ── seed parameter global settings ──
  pgm.sql(`
    INSERT INTO settings (key, "group", label, value_type, value, unit, is_public, description) VALUES
      ('price.default_kursus', 'price', 'price Default Course', 'integer', '500000', 'rupiah', false, 'price default course baru'),
      ('revenue_share.instruktur_default', 'revenue_share', 'Porsi Instructor Default', 'numeric', '60', 'persen', false, 'Porsi instructor default'),
      ('revenue_share.lembaga_default', 'revenue_share', 'Porsi Lembaga Default', 'numeric', '40', 'persen', false, 'Porsi lembaga default'),
      ('commission.tier_default', 'commission', 'Tier Komisi Default', 'json', '[{"category":"mahasiswa","rate":20},{"category":"profesional","rate":20}]', 'persen', false, 'Tier commission per category marketing'),
      ('checkout.timeout_menit', 'checkout', 'Timeout Checkout', 'integer', '60', 'menit', false, 'Batas payment gateway sebelum order kedaluwarsa'),
      ('dp.persen_minimal', 'price', 'DP Minimal', 'numeric', '30', 'persen', false, 'DP minimal untuk skema cicilan'),
      ('cicilan.tenor_maks_month', 'price', 'Tenor Cicilan Maksimum', 'integer', '12', 'month', false, 'Tenor cicilan maksimum'),
      ('certificate.syarat_progres_min_persen', 'certificate', 'Syarat Progres Minimum', 'numeric', '100', 'persen', false, 'Syarat progres kelulusan default'),
      ('certificate.syarat_passing_score_min', 'certificate', 'Syarat Passing Score Minimum', 'numeric', '70', 'points', false, 'Syarat value kelulusan default'),
      ('certificate.syarat_kehadiran_min_persen', 'certificate', 'Syarat Kehadiran Minimum', 'numeric', '0', 'persen', false, 'Syarat kehadiran live class (0 = no wajib)'),
      ('kontak.number_wa_admin', 'kontak', 'Nomor WA Admin', 'string', '6281200000000', NULL, true, 'Nomor WA chat admin (area pra-login)'),
      -- example.com dicadangkan IANA, jadi jelas terbaca sebagai placeholder dan
      -- no pernah menunjuk alamat sungguhan milik siapa pun.
      ('kontak.email_cs', 'kontak', 'Email Layanan', 'string', 'support@example.com', NULL, true, 'Email layanan'),
      ('notification.default_channel', 'notification', 'Kanal Default Notifikasi', 'json', '["in_app","whatsapp"]', NULL, false, 'Kanal default event (domain 10)'),
      ('institution.name', 'kontak', 'name Lembaga', 'string', 'LMS Hub', NULL, true, 'name brand'),
      -- SMTP (diatur super admin; pass sensitif — jangan is_public)
      ('smtp.host', 'smtp', 'SMTP Host', 'string', '', NULL, false, 'Host server SMTP (mis. smtp.gmail.com)'),
      ('smtp.port', 'smtp', 'SMTP Port', 'integer', '587', NULL, false, 'Port SMTP (587 STARTTLS / 465 SSL)'),
      ('smtp.secure', 'smtp', 'SMTP Secure (SSL)', 'boolean', 'false', NULL, false, 'true untuk port 465 (SSL langsung)'),
      ('smtp.user', 'smtp', 'SMTP Username', 'string', '', NULL, false, 'Username/email akun SMTP'),
      ('smtp.pass', 'smtp', 'SMTP Password', 'string', '', NULL, false, 'Password/app-password SMTP (sensitif — FE menyamarkan input)'),
      ('smtp.from', 'smtp', 'Email Pengirim', 'string', 'LMS Hub <no-reply@lmshub.test>', NULL, false, 'Alamat From email logout'),
      -- Rekening transfer bank manual (public agar tampil di checkout)
      ('bank.name', 'bank', 'name Bank', 'string', 'BCA', NULL, true, 'name bank tujuan transfer manual'),
      ('bank.account_number', 'bank', 'Nomor Rekening', 'string', '1234567890', NULL, true, 'Nomor account tujuan'),
      ('bank.account_name', 'bank', 'Atas name', 'string', 'Yayasan LMS Hub', NULL, true, 'name pemilik account'),
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
  pgm.sql(`DROP TYPE IF EXISTS content_page_type;`);
}
