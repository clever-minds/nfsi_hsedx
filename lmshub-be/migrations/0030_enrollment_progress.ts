/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 03 — Enrollment & Progress
 * cohorts, enrollments, cohort_members, lesson_progress, course_progress, notes, bookmarks.
 * Catatan urutan: `cohorts` dibuat sebelum `enrollments` dalam file ini (berbeda dari penomoran
 * dokumen rencana) karena `enrollments.cohort_id` mereferensikan `cohorts(id)`.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE enrollment_sumber AS ENUM ('beli','assign','bundle','path');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE enrollment_status AS ENUM ('terdaftar','aktif','selesai','kedaluwarsa','batal');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE cohort_status AS ENUM ('direncanakan','berjalan','selesai','dibatalkan');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE cohort_member_status AS ENUM ('terdaftar','waitlist','aktif','keluar');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE progress_status AS ENUM ('belum','sedang','selesai');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── cohorts ──
  pgm.sql(`
    CREATE TABLE cohorts (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id         uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      nama              varchar(150) NOT NULL,
      tanggal_mulai     date NOT NULL,
      tanggal_selesai   date,
      kuota_maksimal    integer,
      status            cohort_status NOT NULL DEFAULT 'direncanakan',
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz,
      CONSTRAINT cohorts_kuota_chk CHECK (kuota_maksimal IS NULL OR kuota_maksimal > 0)
    );
    CREATE INDEX cohorts_course_idx ON cohorts (course_id);
    CREATE INDEX cohorts_tanggal_mulai_idx ON cohorts (tanggal_mulai);
    CREATE INDEX cohorts_status_idx ON cohorts (status);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON cohorts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── enrollments ──
  pgm.sql(`
    CREATE TABLE enrollments (
      id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id                uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      cohort_id                uuid REFERENCES cohorts(id) ON DELETE SET NULL,
      sumber                   enrollment_sumber NOT NULL,
      status                   enrollment_status NOT NULL DEFAULT 'terdaftar',
      order_item_id            uuid,
      assigned_by              uuid REFERENCES users(id) ON DELETE SET NULL,
      tanggal_mulai            timestamptz,
      tanggal_selesai          timestamptz,
      akses_kedaluwarsa_at     timestamptz,
      catatan                  text,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now(),
      deleted_at               timestamptz
    );
    CREATE UNIQUE INDEX enrollments_user_course_uq ON enrollments (user_id, course_id)
      WHERE deleted_at IS NULL AND status <> 'batal';
    CREATE INDEX enrollments_user_idx ON enrollments (user_id);
    CREATE INDEX enrollments_course_idx ON enrollments (course_id);
    CREATE INDEX enrollments_cohort_idx ON enrollments (cohort_id);
    CREATE INDEX enrollments_sumber_idx ON enrollments (sumber);
    CREATE INDEX enrollments_status_idx ON enrollments (status);
    CREATE INDEX enrollments_order_item_idx ON enrollments (order_item_id);
    CREATE INDEX enrollments_assigned_by_idx ON enrollments (assigned_by);
    CREATE INDEX enrollments_akses_kedaluwarsa_idx ON enrollments (akses_kedaluwarsa_at);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── cohort_members ──
  pgm.sql(`
    CREATE TABLE cohort_members (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cohort_id           uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
      user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status              cohort_member_status NOT NULL DEFAULT 'terdaftar',
      waitlist_urutan     smallint,
      joined_at           timestamptz NOT NULL DEFAULT now(),
      created_at          timestamptz NOT NULL DEFAULT now(),
      UNIQUE (cohort_id, user_id)
    );
    CREATE INDEX cohort_members_cohort_idx ON cohort_members (cohort_id);
    CREATE INDEX cohort_members_user_idx ON cohort_members (user_id);
    CREATE INDEX cohort_members_status_idx ON cohort_members (status);
  `);

  // ── lesson_progress ──
  pgm.sql(`
    CREATE TABLE lesson_progress (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id     uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      lesson_id         uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      status            progress_status NOT NULL DEFAULT 'belum',
      posisi_detik      integer NOT NULL DEFAULT 0,
      waktu_selesai     timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz,
      UNIQUE (enrollment_id, lesson_id)
    );
    CREATE INDEX lesson_progress_enrollment_idx ON lesson_progress (enrollment_id);
    CREATE INDEX lesson_progress_lesson_idx ON lesson_progress (lesson_id);
    CREATE INDEX lesson_progress_status_idx ON lesson_progress (status);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── course_progress ──
  pgm.sql(`
    CREATE TABLE course_progress (
      id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id              uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      persen_selesai             numeric(5,2) NOT NULL DEFAULT 0,
      jumlah_lesson_selesai      integer NOT NULL DEFAULT 0,
      total_lesson               integer NOT NULL DEFAULT 0,
      last_accessed_at           timestamptz,
      completed_at               timestamptz,
      created_at                 timestamptz NOT NULL DEFAULT now(),
      updated_at                 timestamptz NOT NULL DEFAULT now(),
      deleted_at                 timestamptz,
      CONSTRAINT course_progress_persen_chk CHECK (persen_selesai BETWEEN 0 AND 100)
    );
    CREATE UNIQUE INDEX course_progress_enrollment_uq ON course_progress (enrollment_id);
    CREATE INDEX course_progress_persen_idx ON course_progress (persen_selesai);
    CREATE INDEX course_progress_last_accessed_idx ON course_progress (last_accessed_at);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON course_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── notes ──
  pgm.sql(`
    CREATE TABLE notes (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id       uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      lesson_id           uuid REFERENCES lessons(id) ON DELETE SET NULL,
      isi                 text NOT NULL,
      timestamp_detik     integer,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz
    );
    CREATE INDEX notes_enrollment_idx ON notes (enrollment_id);
    CREATE INDEX notes_lesson_idx ON notes (lesson_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── bookmarks (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE bookmarks (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id     uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      lesson_id         uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      posisi_detik      integer,
      catatan           varchar(200),
      created_at        timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX bookmarks_enrollment_idx ON bookmarks (enrollment_id);
    CREATE INDEX bookmarks_lesson_idx ON bookmarks (lesson_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS bookmarks;`);
  pgm.sql(`DROP TABLE IF EXISTS notes;`);
  pgm.sql(`DROP TABLE IF EXISTS course_progress;`);
  pgm.sql(`DROP TABLE IF EXISTS lesson_progress;`);
  pgm.sql(`DROP TABLE IF EXISTS cohort_members;`);
  pgm.sql(`DROP TABLE IF EXISTS enrollments;`);
  pgm.sql(`DROP TABLE IF EXISTS cohorts;`);
  pgm.sql(`DROP TYPE IF EXISTS progress_status;`);
  pgm.sql(`DROP TYPE IF EXISTS cohort_member_status;`);
  pgm.sql(`DROP TYPE IF EXISTS cohort_status;`);
  pgm.sql(`DROP TYPE IF EXISTS enrollment_status;`);
  pgm.sql(`DROP TYPE IF EXISTS enrollment_sumber;`);
}
