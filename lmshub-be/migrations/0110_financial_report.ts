/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 11 — Keuangan & Laporan — domain finansial
 * expense_category, financial_entries, report_snapshots, reviews.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE financial_entry_direction AS ENUM ('income','expense');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE report_type AS ENUM ('finance','operational','course');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE report_publication_status AS ENUM ('draft','published','archived');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── expense_category ──
  pgm.sql(`
    CREATE TABLE expense_category (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode            citext NOT NULL,
      name            varchar(100) NOT NULL,
      type           financial_entry_direction NOT NULL,
      is_system       boolean NOT NULL DEFAULT false,
      description       text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE UNIQUE INDEX expense_category_kode_uq ON expense_category (kode) WHERE deleted_at IS NULL;
    CREATE INDEX expense_category_type_idx ON expense_category (type);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON expense_category FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── financial_entries ──
  pgm.sql(`
    CREATE TABLE financial_entries (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type               financial_entry_direction NOT NULL,
      category_id         uuid NOT NULL REFERENCES expense_category(id) ON DELETE RESTRICT,
      course_id           uuid REFERENCES courses(id) ON DELETE SET NULL,
      amount             numeric(18,2) NOT NULL,
      proof               text,
      date             date NOT NULL,
      period_month       smallint NOT NULL,
      period_year       smallint NOT NULL,
      description           text,
      recorded_by        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      source_type         varchar(30),
      source_id           uuid,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT financial_entries_amount_chk CHECK (amount >= 0),
      CONSTRAINT financial_entries_month_chk CHECK (period_month BETWEEN 1 AND 12),
      CONSTRAINT financial_entries_year_chk CHECK (period_year BETWEEN 2000 AND 2100),
      CONSTRAINT financial_entries_source_type_chk CHECK (
        source_type IS NULL OR source_type IN ('order','payment','instructor_payout','commission','refund')
      )
    );
    CREATE UNIQUE INDEX financial_entries_source_uq ON financial_entries (source_type, source_id)
      WHERE source_id IS NOT NULL AND deleted_at IS NULL;
    CREATE INDEX financial_entries_type_idx ON financial_entries (type);
    CREATE INDEX financial_entries_category_idx ON financial_entries (category_id);
    CREATE INDEX financial_entries_course_idx ON financial_entries (course_id);
    CREATE INDEX financial_entries_date_idx ON financial_entries (date);
    CREATE INDEX financial_entries_period_idx ON financial_entries (period_year, period_month);
    CREATE INDEX financial_entries_recorded_by_idx ON financial_entries (recorded_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON financial_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── report_snapshots ──
  pgm.sql(`
    CREATE TABLE report_snapshots (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title                   varchar(200) NOT NULL,
      report_type           report_type NOT NULL,
      period_start           date NOT NULL,
      period_finish         date NOT NULL,
      data                    jsonb NOT NULL,
      course_id               uuid REFERENCES courses(id) ON DELETE SET NULL,
      publication_status        report_publication_status NOT NULL DEFAULT 'draft',
      published_by        uuid REFERENCES users(id) ON DELETE SET NULL,
      publication_date       timestamptz,
      created_by             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT report_snapshots_period_chk CHECK (period_finish >= period_start),
      CONSTRAINT report_snapshots_publikasi_chk CHECK (
        publication_status <> 'published' OR (published_by IS NOT NULL AND publication_date IS NOT NULL)
      )
    );
    CREATE INDEX report_snapshots_type_idx ON report_snapshots (report_type);
    CREATE INDEX report_snapshots_period_start_idx ON report_snapshots (period_start);
    CREATE INDEX report_snapshots_period_finish_idx ON report_snapshots (period_finish);
    CREATE INDEX report_snapshots_course_idx ON report_snapshots (course_id);
    CREATE INDEX report_snapshots_status_idx ON report_snapshots (publication_status);
    CREATE INDEX report_snapshots_published_by_idx ON report_snapshots (published_by);
    CREATE INDEX report_snapshots_created_by_idx ON report_snapshots (created_by);
    CREATE INDEX report_snapshots_data_gin_idx ON report_snapshots USING GIN (data);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_snapshots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── reviews ──
  pgm.sql(`
    CREATE TABLE reviews (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id       uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      rating              smallint NOT NULL,
      review              text,
      is_hidden           boolean NOT NULL DEFAULT false,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5)
    );
    CREATE UNIQUE INDEX reviews_enrollment_uq ON reviews (enrollment_id) WHERE deleted_at IS NULL;
    CREATE INDEX reviews_user_idx ON reviews (user_id);
    CREATE INDEX reviews_course_idx ON reviews (course_id);
    CREATE INDEX reviews_rating_idx ON reviews (rating);
    CREATE INDEX reviews_is_hidden_idx ON reviews (is_hidden);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed category biaya sistem ──
  pgm.sql(`
    INSERT INTO expense_category (kode, name, type, is_system) VALUES
      ('penjualan_kursus', 'Penjualan Course', 'income', true),
      ('subscription', 'Langganan/Membership', 'income', true),
      ('payout_instruktur', 'Payout Instructor', 'expense', true),
      ('commission_marketing', 'Komisi Marketing', 'expense', true),
      ('refund', 'Refund', 'expense', true),
      ('operational', 'Operasional', 'expense', true),
      ('pemasaran', 'Pemasaran', 'expense', true),
      ('other', 'Lainnya', 'expense', true)
    ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS reviews;`);
  pgm.sql(`DROP TABLE IF EXISTS report_snapshots;`);
  pgm.sql(`DROP TABLE IF EXISTS financial_entries;`);
  pgm.sql(`DROP TABLE IF EXISTS expense_category;`);
  pgm.sql(`DROP TYPE IF EXISTS report_publication_status;`);
  pgm.sql(`DROP TYPE IF EXISTS report_type;`);
  pgm.sql(`DROP TYPE IF EXISTS financial_entry_direction;`);
}
