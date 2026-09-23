/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 08 — Sertifikat & Gamifikasi — keamanan & keabsahan sertifikat
 * certificate_templates, certificates, badges, user_badges, points_ledger, leaderboards, streaks.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE certificate_status AS ENUM ('belum_memenuhi_syarat','memenuhi_syarat','terbit');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE points_ledger_jenis AS ENUM ('earn','spend');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── certificate_templates ──
  pgm.sql(`
    CREATE TABLE certificate_templates (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nama            varchar(150) NOT NULL,
      deskripsi       text,
      layout          jsonb NOT NULL,
      category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
      course_id       uuid REFERENCES courses(id) ON DELETE SET NULL,
      is_default      boolean NOT NULL DEFAULT false,
      is_aktif        boolean NOT NULL DEFAULT true,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE UNIQUE INDEX certificate_templates_nama_uq ON certificate_templates (nama) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX certificate_templates_default_uq ON certificate_templates (is_default) WHERE is_default AND deleted_at IS NULL;
    CREATE INDEX certificate_templates_category_idx ON certificate_templates (category_id);
    CREATE INDEX certificate_templates_course_idx ON certificate_templates (course_id);
    CREATE INDEX certificate_templates_is_aktif_idx ON certificate_templates (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON certificate_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── certificates (keamanan & keabsahan sertifikat) ──
  pgm.sql(`
    CREATE TABLE certificates (
      id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      course_id                     uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      enrollment_id                 uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
      template_id                   uuid REFERENCES certificate_templates(id) ON DELETE SET NULL,
      nomor_sertifikat              citext,
      kode_verifikasi               citext,
      qr_code_url                   text,
      pdf_url                       text,
      status                        certificate_status NOT NULL DEFAULT 'belum_memenuhi_syarat',
      syarat_snapshot               jsonb,
      tanggal_terbit                timestamptz,
      is_revoked                    boolean NOT NULL DEFAULT false,
      revoked_reason                text,
      supersedes_certificate_id     uuid REFERENCES certificates(id) ON DELETE SET NULL,
      diterbitkan_oleh              uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at                    timestamptz NOT NULL DEFAULT now(),
      updated_at                    timestamptz NOT NULL DEFAULT now(),
      deleted_at                    timestamptz,
      CONSTRAINT certificates_terbit_lengkap_chk CHECK (
        status <> 'terbit' OR (nomor_sertifikat IS NOT NULL AND kode_verifikasi IS NOT NULL AND tanggal_terbit IS NOT NULL)
      ),
      CONSTRAINT certificates_revoked_reason_chk CHECK (is_revoked = false OR revoked_reason IS NOT NULL)
    );
    CREATE UNIQUE INDEX certificates_nomor_uq ON certificates (nomor_sertifikat);
    CREATE UNIQUE INDEX certificates_kode_verifikasi_uq ON certificates (kode_verifikasi);
    CREATE UNIQUE INDEX certificates_enrollment_aktif_uq ON certificates (enrollment_id) WHERE is_revoked = false AND deleted_at IS NULL;
    CREATE INDEX certificates_user_idx ON certificates (user_id);
    CREATE INDEX certificates_course_idx ON certificates (course_id);
    CREATE INDEX certificates_enrollment_idx ON certificates (enrollment_id);
    CREATE INDEX certificates_template_idx ON certificates (template_id);
    CREATE INDEX certificates_status_idx ON certificates (status);
    CREATE INDEX certificates_syarat_snapshot_gin_idx ON certificates USING GIN (syarat_snapshot);
    CREATE INDEX certificates_tanggal_terbit_idx ON certificates (tanggal_terbit);
    CREATE INDEX certificates_is_revoked_idx ON certificates (is_revoked);
    CREATE INDEX certificates_supersedes_idx ON certificates (supersedes_certificate_id);
    CREATE INDEX certificates_diterbitkan_oleh_idx ON certificates (diterbitkan_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── badges ──
  pgm.sql(`
    CREATE TABLE badges (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode            citext NOT NULL,
      nama            varchar(150) NOT NULL,
      deskripsi       text,
      kriteria        jsonb NOT NULL,
      icon_url        text,
      is_aktif        boolean NOT NULL DEFAULT true,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE UNIQUE INDEX badges_kode_uq ON badges (kode) WHERE deleted_at IS NULL;
    CREATE INDEX badges_is_aktif_idx ON badges (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON badges FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── user_badges ──
  pgm.sql(`
    CREATE TABLE user_badges (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id          uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      course_id         uuid REFERENCES courses(id) ON DELETE SET NULL,
      tanggal_diraih    timestamptz NOT NULL DEFAULT now(),
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );
    CREATE UNIQUE INDEX user_badges_user_badge_uq ON user_badges (user_id, badge_id) WHERE deleted_at IS NULL;
    CREATE INDEX user_badges_user_idx ON user_badges (user_id);
    CREATE INDEX user_badges_badge_idx ON user_badges (badge_id);
    CREATE INDEX user_badges_course_idx ON user_badges (course_id);
    CREATE INDEX user_badges_tanggal_diraih_idx ON user_badges (tanggal_diraih);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_badges FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── points_ledger (append-only) ──
  pgm.sql(`
    CREATE TABLE points_ledger (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      jenis             points_ledger_jenis NOT NULL,
      jumlah            integer NOT NULL,
      saldo_setelah     integer NOT NULL,
      sumber_type       varchar(30),
      sumber_id         uuid,
      deskripsi         text,
      created_at        timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT points_ledger_jumlah_chk CHECK (jumlah > 0),
      CONSTRAINT points_ledger_saldo_chk CHECK (saldo_setelah >= 0),
      CONSTRAINT points_ledger_sumber_type_chk CHECK (
        sumber_type IS NULL OR sumber_type IN ('lesson_progress','quiz_attempt','streak','badge','manual_admin')
      )
    );
    CREATE INDEX points_ledger_user_idx ON points_ledger (user_id);
    CREATE INDEX points_ledger_jenis_idx ON points_ledger (jenis);
    CREATE INDEX points_ledger_sumber_idx ON points_ledger (sumber_type, sumber_id);
    CREATE INDEX points_ledger_created_at_idx ON points_ledger (created_at);
  `);

  // ── leaderboards ──
  pgm.sql(`
    CREATE TABLE leaderboards (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      periode_jenis       varchar(20) NOT NULL,
      periode_mulai       date NOT NULL,
      periode_selesai     date NOT NULL,
      course_id           uuid REFERENCES courses(id) ON DELETE SET NULL,
      data                jsonb NOT NULL,
      dihitung_at         timestamptz NOT NULL DEFAULT now(),
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT leaderboards_periode_jenis_chk CHECK (periode_jenis IN ('mingguan','bulanan','sepanjang_waktu')),
      CONSTRAINT leaderboards_periode_chk CHECK (periode_selesai >= periode_mulai)
    );
    CREATE UNIQUE INDEX leaderboards_periode_scope_uq ON leaderboards (
      periode_jenis, periode_mulai, periode_selesai, COALESCE(course_id, '00000000-0000-0000-0000-000000000000')
    ) WHERE deleted_at IS NULL;
    CREATE INDEX leaderboards_periode_jenis_idx ON leaderboards (periode_jenis);
    CREATE INDEX leaderboards_periode_mulai_idx ON leaderboards (periode_mulai);
    CREATE INDEX leaderboards_periode_selesai_idx ON leaderboards (periode_selesai);
    CREATE INDEX leaderboards_course_idx ON leaderboards (course_id);
    CREATE INDEX leaderboards_data_gin_idx ON leaderboards USING GIN (data);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON leaderboards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── streaks ──
  pgm.sql(`
    CREATE TABLE streaks (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      streak_hari_berjalan        integer NOT NULL DEFAULT 0,
      streak_terpanjang           integer NOT NULL DEFAULT 0,
      tanggal_terakhir_aktif      date,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT streaks_berjalan_chk CHECK (streak_hari_berjalan >= 0),
      CONSTRAINT streaks_terpanjang_chk CHECK (streak_terpanjang >= 0)
    );
    CREATE UNIQUE INDEX streaks_user_uq ON streaks (user_id) WHERE deleted_at IS NULL;
    CREATE INDEX streaks_berjalan_idx ON streaks (streak_hari_berjalan);
    CREATE INDEX streaks_tanggal_terakhir_idx ON streaks (tanggal_terakhir_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON streaks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed data awal ──
  pgm.sql(`
    INSERT INTO certificate_templates (nama, deskripsi, layout, is_default, is_aktif)
    VALUES ('Template Standar', 'Template sertifikat bawaan lembaga',
      '{"placeholder":["{{nama}}","{{kursus}}","{{nomor}}"]}'::jsonb, true, true)
    ON CONFLICT (nama) WHERE deleted_at IS NULL DO NOTHING;
  `);
  pgm.sql(`
    INSERT INTO badges (kode, nama, deskripsi, kriteria, is_aktif) VALUES
      ('kursus_pertama_selesai', 'Kursus Pertama Selesai', 'Menyelesaikan kursus pertama', '{"jenis":"course_selesai","threshold":1}'::jsonb, true),
      ('nilai_sempurna', 'Nilai Sempurna', 'Mendapat skor sempurna pada sebuah kuis', '{"jenis":"quiz_sempurna","threshold":100}'::jsonb, true),
      ('streak_7_hari', 'Streak 7 Hari', 'Belajar 7 hari beruntun', '{"jenis":"streak_hari","threshold":7}'::jsonb, true)
    ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS streaks;`);
  pgm.sql(`DROP TABLE IF EXISTS leaderboards;`);
  pgm.sql(`DROP TABLE IF EXISTS points_ledger;`);
  pgm.sql(`DROP TABLE IF EXISTS user_badges;`);
  pgm.sql(`DROP TABLE IF EXISTS badges;`);
  pgm.sql(`DROP TABLE IF EXISTS certificates;`);
  pgm.sql(`DROP TABLE IF EXISTS certificate_templates;`);
  pgm.sql(`DROP TYPE IF EXISTS points_ledger_jenis;`);
  pgm.sql(`DROP TYPE IF EXISTS certificate_status;`);
}
