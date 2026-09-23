/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 09 — Marketing & Komisi — domain finansial
 * marketing_categories, affiliate_profiles, referral_links, leads, lead_stage_history, commissions.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE affiliate_status_verifikasi AS ENUM ('menunggu','terverifikasi','ditolak');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE lead_tahap AS ENUM ('lead','prospek','closing');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE commission_status AS ENUM
      ('dihitung','menunggu_approval','disetujui','pencairan','selesai','ditolak');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── marketing_categories ──
  pgm.sql(`
    CREATE TABLE marketing_categories (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode                    citext NOT NULL,
      nama                    varchar(100) NOT NULL,
      deskripsi               text,
      target_default          numeric(18,2) NOT NULL DEFAULT 0,
      target_satuan           varchar(20) NOT NULL DEFAULT 'rupiah',
      rate_komisi_default     numeric(5,2) NOT NULL DEFAULT 0,
      urutan                  smallint NOT NULL DEFAULT 0,
      is_aktif                boolean NOT NULL DEFAULT true,
      is_system               boolean NOT NULL DEFAULT false,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT marketing_categories_target_chk CHECK (target_default >= 0),
      CONSTRAINT marketing_categories_target_satuan_chk CHECK (target_satuan IN ('rupiah','leads','closing')),
      CONSTRAINT marketing_categories_rate_chk CHECK (rate_komisi_default >= 0 AND rate_komisi_default <= 100)
    );
    CREATE UNIQUE INDEX marketing_categories_kode_uq ON marketing_categories (kode) WHERE deleted_at IS NULL;
    CREATE INDEX marketing_categories_is_aktif_idx ON marketing_categories (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON marketing_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── affiliate_profiles ──
  pgm.sql(`
    CREATE TABLE affiliate_profiles (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id                 uuid NOT NULL REFERENCES marketing_categories(id) ON DELETE RESTRICT,
      kode_agen                   citext NOT NULL,
      target                      numeric(18,2) NOT NULL DEFAULT 0,
      status_verifikasi           affiliate_status_verifikasi NOT NULL DEFAULT 'menunggu',
      verified_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
      verified_at                 timestamptz,
      alasan_penolakan            text,
      nama_bank                   varchar(60),
      no_rekening                 varchar(40),
      nama_pemilik_rekening       varchar(150),
      parent_agen_user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
      bergabung_at                timestamptz,
      meta                        jsonb,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT affiliate_profiles_target_chk CHECK (target >= 0),
      CONSTRAINT affiliate_profiles_parent_chk CHECK (parent_agen_user_id IS NULL OR parent_agen_user_id <> user_id)
    );
    CREATE UNIQUE INDEX affiliate_profiles_user_uq ON affiliate_profiles (user_id) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX affiliate_profiles_kode_agen_uq ON affiliate_profiles (kode_agen) WHERE deleted_at IS NULL;
    CREATE INDEX affiliate_profiles_category_idx ON affiliate_profiles (category_id);
    CREATE INDEX affiliate_profiles_status_idx ON affiliate_profiles (status_verifikasi);
    CREATE INDEX affiliate_profiles_verified_by_idx ON affiliate_profiles (verified_by);
    CREATE INDEX affiliate_profiles_parent_idx ON affiliate_profiles (parent_agen_user_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON affiliate_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── referral_links ──
  pgm.sql(`
    CREATE TABLE referral_links (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agen_user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kode                citext NOT NULL,
      url_target          text NOT NULL,
      judul               varchar(150),
      jumlah_kunjungan    bigint NOT NULL DEFAULT 0,
      jumlah_konversi     bigint NOT NULL DEFAULT 0,
      is_aktif            boolean NOT NULL DEFAULT true,
      expires_at          timestamptz,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT referral_links_kunjungan_chk CHECK (jumlah_kunjungan >= 0),
      CONSTRAINT referral_links_konversi_chk CHECK (jumlah_konversi >= 0)
    );
    CREATE UNIQUE INDEX referral_links_kode_uq ON referral_links (kode) WHERE deleted_at IS NULL;
    CREATE INDEX referral_links_agen_idx ON referral_links (agen_user_id);
    CREATE INDEX referral_links_is_aktif_idx ON referral_links (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON referral_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── leads ──
  pgm.sql(`
    CREATE TABLE leads (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agen_user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nama_calon                  varchar(150) NOT NULL,
      kontak                      varchar(120) NOT NULL,
      minat_course_id             uuid REFERENCES courses(id) ON DELETE SET NULL,
      tahap                       lead_tahap NOT NULL DEFAULT 'lead',
      catatan                     text,
      sumber_referral_link_id     uuid REFERENCES referral_links(id) ON DELETE SET NULL,
      order_id                    uuid REFERENCES orders(id) ON DELETE SET NULL,
      closing_at                  timestamptz,
      meta                        jsonb,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT leads_closing_order_chk CHECK (tahap <> 'closing' OR order_id IS NOT NULL)
    );
    CREATE UNIQUE INDEX leads_order_uq ON leads (order_id) WHERE order_id IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX leads_agen_idx ON leads (agen_user_id);
    CREATE INDEX leads_kontak_idx ON leads (kontak);
    CREATE INDEX leads_minat_course_idx ON leads (minat_course_id);
    CREATE INDEX leads_tahap_idx ON leads (tahap);
    CREATE INDEX leads_sumber_referral_idx ON leads (sumber_referral_link_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── lead_stage_history (append-only) ──
  pgm.sql(`
    CREATE TABLE lead_stage_history (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id           uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      tahap_dari        lead_tahap,
      tahap_ke          lead_tahap NOT NULL,
      catatan           text,
      aktor_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
      waktu             timestamptz NOT NULL DEFAULT now(),
      created_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lead_stage_history_beda_tahap_chk CHECK (tahap_dari IS NULL OR tahap_dari <> tahap_ke)
    );
    CREATE INDEX lead_stage_history_lead_idx ON lead_stage_history (lead_id);
    CREATE INDEX lead_stage_history_tahap_ke_idx ON lead_stage_history (tahap_ke);
    CREATE INDEX lead_stage_history_aktor_idx ON lead_stage_history (aktor_user_id);
    CREATE INDEX lead_stage_history_waktu_idx ON lead_stage_history (waktu);
  `);

  // ── commissions (finansial) ──
  pgm.sql(`
    CREATE TABLE commissions (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agen_user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      category_id           uuid REFERENCES marketing_categories(id) ON DELETE SET NULL,
      dasar_perhitungan     numeric(18,2) NOT NULL,
      rate                  numeric(5,2) NOT NULL,
      nominal               numeric(18,2) NOT NULL,
      status                commission_status NOT NULL DEFAULT 'dihitung',
      approved_by           uuid REFERENCES users(id) ON DELETE SET NULL,
      approved_at           timestamptz,
      tanggal_cair          timestamptz,
      bukti_cair            text,
      catatan               text,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT commissions_dasar_chk CHECK (dasar_perhitungan >= 0),
      CONSTRAINT commissions_rate_chk CHECK (rate >= 0 AND rate <= 100),
      CONSTRAINT commissions_nominal_chk CHECK (nominal >= 0),
      CONSTRAINT commissions_approval_chk CHECK (
        status NOT IN ('disetujui','pencairan','selesai') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
      ),
      CONSTRAINT commissions_pencairan_chk CHECK (
        status <> 'selesai' OR (tanggal_cair IS NOT NULL AND bukti_cair IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX commissions_order_uq ON commissions (order_id) WHERE deleted_at IS NULL;
    CREATE INDEX commissions_agen_idx ON commissions (agen_user_id);
    CREATE INDEX commissions_category_idx ON commissions (category_id);
    CREATE INDEX commissions_status_idx ON commissions (status);
    CREATE INDEX commissions_approved_by_idx ON commissions (approved_by);
    CREATE INDEX commissions_tanggal_cair_idx ON commissions (tanggal_cair);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed 4 kategori marketing ──
  pgm.sql(`
    INSERT INTO marketing_categories (kode, nama, deskripsi, target_default, target_satuan, rate_komisi_default, is_system) VALUES
      ('mahasiswa', 'Mahasiswa', 'Target dasar (entry)', 10000000, 'rupiah', 20.00, true),
      ('umum', 'Umum', 'Target menengah', 25000000, 'rupiah', 20.00, true),
      ('profesional', 'Profesional', 'Target tinggi, agen berpengalaman', 50000000, 'rupiah', 20.00, true),
      ('freelance', 'Freelance', 'Agen lepas, target menengah-tinggi', 35000000, 'rupiah', 20.00, true)
    ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS commissions;`);
  pgm.sql(`DROP TABLE IF EXISTS lead_stage_history;`);
  pgm.sql(`DROP TABLE IF EXISTS leads;`);
  pgm.sql(`DROP TABLE IF EXISTS referral_links;`);
  pgm.sql(`DROP TABLE IF EXISTS affiliate_profiles;`);
  pgm.sql(`DROP TABLE IF EXISTS marketing_categories;`);
  pgm.sql(`DROP TYPE IF EXISTS commission_status;`);
  pgm.sql(`DROP TYPE IF EXISTS lead_tahap;`);
  pgm.sql(`DROP TYPE IF EXISTS affiliate_status_verifikasi;`);
}
