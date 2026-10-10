/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 06 — Live Class & Kalender
 * live_sessions, session_attendance, recordings, calendar_events.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE live_session_provider AS ENUM ('zoom','bbb','meet');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE live_session_status AS ENUM ('scheduled','ongoing','completed','recording_available');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE attendance_status AS ENUM ('not_started','present','late','absent');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE calendar_event_source AS ENUM ('live_session','assignment','quiz','other');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── live_sessions ──
  pgm.sql(`
    CREATE TABLE live_sessions (
      id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id                       uuid REFERENCES courses(id) ON DELETE CASCADE,
      cohort_id                       uuid REFERENCES cohorts(id) ON DELETE CASCADE,
      title                           varchar(200) NOT NULL,
      description                       text,
      provider                        live_session_provider NOT NULL DEFAULT 'zoom',
      url_join                        text NOT NULL,
      host_user_id                    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      start_time                     timestamptz NOT NULL,
      end_time                   timestamptz NOT NULL,
      kapasitas_maks                  integer,
      toleransi_terlambat_menit       smallint NOT NULL DEFAULT 15,
      status                          live_session_status NOT NULL DEFAULT 'scheduled',
      created_by                     uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at                      timestamptz NOT NULL DEFAULT now(),
      updated_at                      timestamptz NOT NULL DEFAULT now(),
      deleted_at                      timestamptz,
      CONSTRAINT live_sessions_cakupan_chk CHECK (course_id IS NOT NULL OR cohort_id IS NOT NULL),
      CONSTRAINT live_sessions_time_chk CHECK (end_time > start_time),
      CONSTRAINT live_sessions_kapasitas_chk CHECK (kapasitas_maks IS NULL OR kapasitas_maks > 0)
    );
    CREATE INDEX live_sessions_course_idx ON live_sessions (course_id);
    CREATE INDEX live_sessions_cohort_idx ON live_sessions (cohort_id);
    CREATE INDEX live_sessions_provider_idx ON live_sessions (provider);
    CREATE INDEX live_sessions_host_idx ON live_sessions (host_user_id);
    CREATE INDEX live_sessions_start_time_idx ON live_sessions (start_time);
    CREATE INDEX live_sessions_end_time_idx ON live_sessions (end_time);
    CREATE INDEX live_sessions_status_idx ON live_sessions (status);
    CREATE INDEX live_sessions_created_by_idx ON live_sessions (created_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── session_attendance (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE session_attendance (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      live_session_id         uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status                  attendance_status NOT NULL DEFAULT 'not_started',
      time_join              timestamptz,
      time_leave             timestamptz,
      durasi_hadir_menit      integer NOT NULL DEFAULT 0,
      ditandai_manual         boolean NOT NULL DEFAULT false,
      ditandai_by           uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT session_attendance_durasi_chk CHECK (durasi_hadir_menit >= 0),
      CONSTRAINT session_attendance_time_chk CHECK (time_leave IS NULL OR time_join IS NULL OR time_leave >= time_join),
      UNIQUE (live_session_id, user_id)
    );
    CREATE INDEX session_attendance_live_session_idx ON session_attendance (live_session_id);
    CREATE INDEX session_attendance_user_idx ON session_attendance (user_id);
    CREATE INDEX session_attendance_status_idx ON session_attendance (status);
    CREATE INDEX session_attendance_ditandai_by_idx ON session_attendance (ditandai_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON session_attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── recordings ──
  pgm.sql(`
    CREATE TABLE recordings (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      live_session_id       uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      url                   text NOT NULL,
      duration_minutes          integer,
      size_bytes          bigint,
      status_jadi_materi    boolean NOT NULL DEFAULT false,
      lesson_id             uuid REFERENCES lessons(id) ON DELETE SET NULL,
      retensi_hingga        timestamptz,
      diunggah_by         uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT recordings_durasi_chk CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
      CONSTRAINT recordings_ukuran_chk CHECK (size_bytes IS NULL OR size_bytes >= 0)
    );
    CREATE INDEX recordings_live_session_idx ON recordings (live_session_id);
    CREATE INDEX recordings_status_jadi_materi_idx ON recordings (status_jadi_materi);
    CREATE INDEX recordings_lesson_idx ON recordings (lesson_id);
    CREATE INDEX recordings_retensi_idx ON recordings (retensi_hingga);
    CREATE INDEX recordings_diunggah_by_idx ON recordings (diunggah_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON recordings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── calendar_events ──
  pgm.sql(`
    CREATE TABLE calendar_events (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source              calendar_event_source NOT NULL,
      source_id           uuid,
      course_id           uuid REFERENCES courses(id) ON DELETE CASCADE,
      title               varchar(200) NOT NULL,
      start_time         timestamptz NOT NULL,
      end_time       timestamptz,
      is_sepanjang_hari   boolean NOT NULL DEFAULT false,
      meta                jsonb,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT calendar_events_time_chk CHECK (end_time IS NULL OR end_time >= start_time)
    );
    CREATE INDEX calendar_events_source_idx ON calendar_events (source);
    CREATE INDEX calendar_events_source_source_idx ON calendar_events (source, source_id);
    CREATE INDEX calendar_events_course_idx ON calendar_events (course_id);
    CREATE INDEX calendar_events_start_time_idx ON calendar_events (start_time);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS calendar_events;`);
  pgm.sql(`DROP TABLE IF EXISTS recordings;`);
  pgm.sql(`DROP TABLE IF EXISTS session_attendance;`);
  pgm.sql(`DROP TABLE IF EXISTS live_sessions;`);
  pgm.sql(`DROP TYPE IF EXISTS calendar_event_source;`);
  pgm.sql(`DROP TYPE IF EXISTS attendance_status;`);
  pgm.sql(`DROP TYPE IF EXISTS live_session_status;`);
  pgm.sql(`DROP TYPE IF EXISTS live_session_provider;`);
}
