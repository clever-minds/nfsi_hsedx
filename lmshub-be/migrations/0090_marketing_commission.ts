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
    DO $$ BEGIN CREATE TYPE affiliate_verification_status AS ENUM ('pending','verified','rejected');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE lead_stage AS ENUM ('lead','prospect','closing');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE commission_status AS ENUM
      ('calculated','awaiting_approval','approved','disbursement','completed','rejected');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── marketing_categories ──
  pgm.sql(`
    CREATE TABLE marketing_categories (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode                    citext NOT NULL,
      name                    varchar(100) NOT NULL,
      description               text,
      target_default          numeric(18,2) NOT NULL DEFAULT 0,
      target_unit           varchar(20) NOT NULL DEFAULT 'rupiah',
      rate_commission_default     numeric(5,2) NOT NULL DEFAULT 0,
      sort_order                  smallint NOT NULL DEFAULT 0,
      is_active                boolean NOT NULL DEFAULT true,
      is_system               boolean NOT NULL DEFAULT false,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT marketing_categories_target_chk CHECK (target_default >= 0),
      CONSTRAINT marketing_categories_target_unit_chk CHECK (target_unit IN ('rupiah','leads','closing')),
      CONSTRAINT marketing_categories_rate_chk CHECK (rate_commission_default >= 0 AND rate_commission_default <= 100)
    );
    CREATE UNIQUE INDEX marketing_categories_kode_uq ON marketing_categories (kode) WHERE deleted_at IS NULL;
    CREATE INDEX marketing_categories_is_aktif_idx ON marketing_categories (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON marketing_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── affiliate_profiles ──
  pgm.sql(`
    CREATE TABLE affiliate_profiles (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id                 uuid NOT NULL REFERENCES marketing_categories(id) ON DELETE RESTRICT,
      agent_code                   citext NOT NULL,
      target                      numeric(18,2) NOT NULL DEFAULT 0,
      verification_status           affiliate_verification_status NOT NULL DEFAULT 'pending',
      verified_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
      verified_at                 timestamptz,
      rejection_reason            text,
      bank_name                   varchar(60),
      no_account                 varchar(40),
      account_owner_name       varchar(150),
      parent_agent_user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
      joined_at                timestamptz,
      meta                        jsonb,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT affiliate_profiles_target_chk CHECK (target >= 0),
      CONSTRAINT affiliate_profiles_parent_chk CHECK (parent_agent_user_id IS NULL OR parent_agent_user_id <> user_id)
    );
    CREATE UNIQUE INDEX affiliate_profiles_user_uq ON affiliate_profiles (user_id) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX affiliate_profiles_agent_code_uq ON affiliate_profiles (agent_code) WHERE deleted_at IS NULL;
    CREATE INDEX affiliate_profiles_category_idx ON affiliate_profiles (category_id);
    CREATE INDEX affiliate_profiles_status_idx ON affiliate_profiles (verification_status);
    CREATE INDEX affiliate_profiles_verified_by_idx ON affiliate_profiles (verified_by);
    CREATE INDEX affiliate_profiles_parent_idx ON affiliate_profiles (parent_agent_user_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON affiliate_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── referral_links ──
  pgm.sql(`
    CREATE TABLE referral_links (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kode                citext NOT NULL,
      target_url          text NOT NULL,
      title               varchar(150),
      visit_count    bigint NOT NULL DEFAULT 0,
      conversion_count     bigint NOT NULL DEFAULT 0,
      is_active            boolean NOT NULL DEFAULT true,
      expires_at          timestamptz,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT referral_links_visit_chk CHECK (visit_count >= 0),
      CONSTRAINT referral_links_conversion_chk CHECK (conversion_count >= 0)
    );
    CREATE UNIQUE INDEX referral_links_kode_uq ON referral_links (kode) WHERE deleted_at IS NULL;
    CREATE INDEX referral_links_agen_idx ON referral_links (agent_user_id);
    CREATE INDEX referral_links_is_aktif_idx ON referral_links (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON referral_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── leads ──
  pgm.sql(`
    CREATE TABLE leads (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lead_name                  varchar(150) NOT NULL,
      kontak                      varchar(120) NOT NULL,
      interested_course_id             uuid REFERENCES courses(id) ON DELETE SET NULL,
      stage                       lead_stage NOT NULL DEFAULT 'lead',
      notes                     text,
      source_referral_link_id     uuid REFERENCES referral_links(id) ON DELETE SET NULL,
      order_id                    uuid REFERENCES orders(id) ON DELETE SET NULL,
      closing_at                  timestamptz,
      meta                        jsonb,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT leads_closing_order_chk CHECK (stage <> 'closing' OR order_id IS NOT NULL)
    );
    CREATE UNIQUE INDEX leads_order_uq ON leads (order_id) WHERE order_id IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX leads_agen_idx ON leads (agent_user_id);
    CREATE INDEX leads_kontak_idx ON leads (kontak);
    CREATE INDEX leads_interested_course_idx ON leads (interested_course_id);
    CREATE INDEX leads_stage_idx ON leads (stage);
    CREATE INDEX leads_source_referral_idx ON leads (source_referral_link_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── lead_stage_history (append-only) ──
  pgm.sql(`
    CREATE TABLE lead_stage_history (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id           uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      stage_from        lead_stage,
      stage_to          lead_stage NOT NULL,
      notes           text,
      actor_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
      time             timestamptz NOT NULL DEFAULT now(),
      created_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT lead_stage_history_beda_stage_chk CHECK (stage_from IS NULL OR stage_from <> stage_to)
    );
    CREATE INDEX lead_stage_history_lead_idx ON lead_stage_history (lead_id);
    CREATE INDEX lead_stage_history_stage_to_idx ON lead_stage_history (stage_to);
    CREATE INDEX lead_stage_history_aktor_idx ON lead_stage_history (actor_user_id);
    CREATE INDEX lead_stage_history_time_idx ON lead_stage_history (time);
  `);

  // ── commissions (finansial) ──
  pgm.sql(`
    CREATE TABLE commissions (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
      category_id           uuid REFERENCES marketing_categories(id) ON DELETE SET NULL,
      calculation_base     numeric(18,2) NOT NULL,
      rate                  numeric(5,2) NOT NULL,
      amount               numeric(18,2) NOT NULL,
      status                commission_status NOT NULL DEFAULT 'calculated',
      approved_by           uuid REFERENCES users(id) ON DELETE SET NULL,
      approved_at           timestamptz,
      disbursement_date          timestamptz,
      disbursement_proof            text,
      notes               text,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT commissions_base_chk CHECK (calculation_base >= 0),
      CONSTRAINT commissions_rate_chk CHECK (rate >= 0 AND rate <= 100),
      CONSTRAINT commissions_amount_chk CHECK (amount >= 0),
      CONSTRAINT commissions_approval_chk CHECK (
        status NOT IN ('approved','disbursement','completed') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
      ),
      CONSTRAINT commissions_pencairan_chk CHECK (
        status <> 'completed' OR (disbursement_date IS NOT NULL AND disbursement_proof IS NOT NULL)
      )
    );
    CREATE UNIQUE INDEX commissions_order_uq ON commissions (order_id) WHERE deleted_at IS NULL;
    CREATE INDEX commissions_agen_idx ON commissions (agent_user_id);
    CREATE INDEX commissions_category_idx ON commissions (category_id);
    CREATE INDEX commissions_status_idx ON commissions (status);
    CREATE INDEX commissions_approved_by_idx ON commissions (approved_by);
    CREATE INDEX commissions_disbursement_date_idx ON commissions (disbursement_date);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed 4 category marketing ──
  pgm.sql(`
    INSERT INTO marketing_categories (kode, name, description, target_default, target_unit, rate_commission_default, is_system) VALUES
      ('mahasiswa', 'Mahasiswa', 'Target base (entry)', 10000000, 'rupiah', 20.00, true),
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
  pgm.sql(`DROP TYPE IF EXISTS lead_stage;`);
  pgm.sql(`DROP TYPE IF EXISTS affiliate_verification_status;`);
}
