/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 08 — Certificate & Gamifikasi — keamanan & keabsahan certificate
 * certificate_templates, certificates, badges, user_badges, pointsts_ledger, leaderboards, streaks.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE certificate_status AS ENUM ('not_eligible','eligible','publish');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE pointsts_ledger_type AS ENUM ('earn','spend');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── certificate_templates ──
  pgm.sql(`
    CREATE TABLE certificate_templates (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name            varchar(150) NOT NULL,
      description       text,
      layout          jsonb NOT NULL,
      category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
      course_id       uuid REFERENCES courses(id) ON DELETE SET NULL,
      is_default      boolean NOT NULL DEFAULT false,
      is_active        boolean NOT NULL DEFAULT true,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE UNIQUE INDEX certificate_templates_name_uq ON certificate_templates (name) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX certificate_templates_default_uq ON certificate_templates (is_default) WHERE is_default AND deleted_at IS NULL;
    CREATE INDEX certificate_templates_category_idx ON certificate_templates (category_id);
    CREATE INDEX certificate_templates_course_idx ON certificate_templates (course_id);
    CREATE INDEX certificate_templates_is_aktif_idx ON certificate_templates (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON certificate_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── certificates (keamanan & keabsahan certificate) ──
  pgm.sql(`
    CREATE TABLE certificates (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      course_id                     uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      enrollment_id                 uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
      template_id                   uuid REFERENCES certificate_templates(id) ON DELETE SET NULL,
      certificate_number              citext,
      verification_code               citext,
      qr_code_url                   text,
      pdf_url                       text,
      status                        certificate_status NOT NULL DEFAULT 'not_eligible',
      criteria_snapshot               jsonb,
      publish_date                timestamptz,
      is_revoked                    boolean NOT NULL DEFAULT false,
      revoked_reason                text,
      supersedes_certificate_id     uuid REFERENCES certificates(id) ON DELETE SET NULL,
      issued_by              uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at                    timestamptz NOT NULL DEFAULT now(),
      updated_at                    timestamptz NOT NULL DEFAULT now(),
      deleted_at                    timestamptz,
      CONSTRAINT certificates_publish_lengkap_chk CHECK (
        status <> 'publish' OR (certificate_number IS NOT NULL AND verification_code IS NOT NULL AND publish_date IS NOT NULL)
      ),
      CONSTRAINT certificates_revoked_reason_chk CHECK (is_revoked = false OR revoked_reason IS NOT NULL)
    );
    CREATE UNIQUE INDEX certificates_number_uq ON certificates (certificate_number);
    CREATE UNIQUE INDEX certificates_kode_verifikasi_uq ON certificates (verification_code);
    CREATE UNIQUE INDEX certificates_enrollment_aktif_uq ON certificates (enrollment_id) WHERE is_revoked = false AND deleted_at IS NULL;
    CREATE INDEX certificates_user_idx ON certificates (user_id);
    CREATE INDEX certificates_course_idx ON certificates (course_id);
    CREATE INDEX certificates_enrollment_idx ON certificates (enrollment_id);
    CREATE INDEX certificates_template_idx ON certificates (template_id);
    CREATE INDEX certificates_status_idx ON certificates (status);
    CREATE INDEX certificates_criteria_snapshot_gin_idx ON certificates USING GIN (criteria_snapshot);
    CREATE INDEX certificates_date_publish_idx ON certificates (publish_date);
    CREATE INDEX certificates_is_revoked_idx ON certificates (is_revoked);
    CREATE INDEX certificates_supersedes_idx ON certificates (supersedes_certificate_id);
    CREATE INDEX certificates_issued_by_idx ON certificates (issued_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── badges ──
  pgm.sql(`
    CREATE TABLE badges (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode            citext NOT NULL,
      name            varchar(150) NOT NULL,
      description       text,
      criteria        jsonb NOT NULL,
      icon_url        text,
      is_active        boolean NOT NULL DEFAULT true,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE UNIQUE INDEX badges_kode_uq ON badges (kode) WHERE deleted_at IS NULL;
    CREATE INDEX badges_is_aktif_idx ON badges (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON badges FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── user_badges ──
  pgm.sql(`
    CREATE TABLE user_badges (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id          uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      course_id         uuid REFERENCES courses(id) ON DELETE SET NULL,
      date_earned    timestamptz NOT NULL DEFAULT now(),
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );
    CREATE UNIQUE INDEX user_badges_user_badge_uq ON user_badges (user_id, badge_id) WHERE deleted_at IS NULL;
    CREATE INDEX user_badges_user_idx ON user_badges (user_id);
    CREATE INDEX user_badges_badge_idx ON user_badges (badge_id);
    CREATE INDEX user_badges_course_idx ON user_badges (course_id);
    CREATE INDEX user_badges_date_earned_idx ON user_badges (date_earned);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_badges FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── pointsts_ledger (append-only) ──
  pgm.sql(`
    CREATE TABLE pointsts_ledger (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type             pointsts_ledger_type NOT NULL,
      amount            integer NOT NULL,
      balance_after     integer NOT NULL,
      source_type       varchar(30),
      source_id         uuid,
      description         text,
      created_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pointsts_ledger_amount_chk CHECK (amount > 0),
      CONSTRAINT pointsts_ledger_saldo_chk CHECK (balance_after >= 0),
      CONSTRAINT pointsts_ledger_source_type_chk CHECK (
        source_type IS NULL OR source_type IN ('lesson_progress','quiz_attempt','streak','badge','manual_admin')
      )
    );
    CREATE INDEX pointsts_ledger_user_idx ON pointsts_ledger (user_id);
    CREATE INDEX pointsts_ledger_type_idx ON pointsts_ledger (type);
    CREATE INDEX pointsts_ledger_source_idx ON pointsts_ledger (source_type, source_id);
    CREATE INDEX pointsts_ledger_created_at_idx ON pointsts_ledger (created_at);
  `);

  // ── leaderboards ──
  pgm.sql(`
    CREATE TABLE leaderboards (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      period_type       varchar(20) NOT NULL,
      period_start       date NOT NULL,
      period_finish     date NOT NULL,
      course_id           uuid REFERENCES courses(id) ON DELETE SET NULL,
      data                jsonb NOT NULL,
      calculated_at         timestamptz NOT NULL DEFAULT now(),
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT leaderboards_period_type_chk CHECK (period_type IN ('weekly','monthly','all_time')),
      CONSTRAINT leaderboards_period_chk CHECK (period_finish >= period_start)
    );
    CREATE UNIQUE INDEX leaderboards_period_scope_uq ON leaderboards (
      period_type, period_start, period_finish, COALESCE(course_id, '00000000-0000-0000-0000-000000000000')
    ) WHERE deleted_at IS NULL;
    CREATE INDEX leaderboards_period_type_idx ON leaderboards (period_type);
    CREATE INDEX leaderboards_period_start_idx ON leaderboards (period_start);
    CREATE INDEX leaderboards_period_finish_idx ON leaderboards (period_finish);
    CREATE INDEX leaderboards_course_idx ON leaderboards (course_id);
    CREATE INDEX leaderboards_data_gin_idx ON leaderboards USING GIN (data);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON leaderboards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── streaks ──
  pgm.sql(`
    CREATE TABLE streaks (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_streak_days        integer NOT NULL DEFAULT 0,
      longest_streak           integer NOT NULL DEFAULT 0,
      last_active_date      date,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT streaks_berjalan_chk CHECK (current_streak_days >= 0),
      CONSTRAINT streaks_terpanjang_chk CHECK (longest_streak >= 0)
    );
    CREATE UNIQUE INDEX streaks_user_uq ON streaks (user_id) WHERE deleted_at IS NULL;
    CREATE INDEX streaks_berjalan_idx ON streaks (current_streak_days);
    CREATE INDEX streaks_date_terakhir_idx ON streaks (last_active_date);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON streaks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed data awal ──
  pgm.sql(`
    INSERT INTO certificate_templates (name, description, layout, is_default, is_active)
    VALUES ('Template Standar', 'Template certificate bawaan lembaga',
      '{"placeholder":["{{name}}","{{course}}","{{number}}"]}'::jsonb, true, true)
    ON CONFLICT (name) WHERE deleted_at IS NULL DO NOTHING;
  `);
  pgm.sql(`
    INSERT INTO badges (kode, name, description, criteria, is_active) VALUES
      ('first_course_finished', 'Course Pertama finish', 'Menyelesaikan course pertama', '{"type":"course_finish","threshold":1}'::jsonb, true),
      ('perfect_score', 'grade Sempurna', 'Mendapat score sempurna pada sebuah quiz', '{"type":"quiz_sempurna","threshold":100}'::jsonb, true),
      ('7_day_streak', 'Streak 7 Hari', 'Belajar 7 hari beruntun', '{"type":"streak_hari","threshold":7}'::jsonb, true)
    ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS streaks;`);
  pgm.sql(`DROP TABLE IF EXISTS leaderboards;`);
  pgm.sql(`DROP TABLE IF EXISTS pointsts_ledger;`);
  pgm.sql(`DROP TABLE IF EXISTS user_badges;`);
  pgm.sql(`DROP TABLE IF EXISTS badges;`);
  pgm.sql(`DROP TABLE IF EXISTS certificates;`);
  pgm.sql(`DROP TABLE IF EXISTS certificate_templates;`);
  pgm.sql(`DROP TYPE IF EXISTS pointsts_ledger_type;`);
  pgm.sql(`DROP TYPE IF EXISTS certificate_status;`);
}
