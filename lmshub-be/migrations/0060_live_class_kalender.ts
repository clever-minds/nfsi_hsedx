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
    DO $$ BEGIN CREATE TYPE live_session_penyedia AS ENUM ('zoom','bbb','meet');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE live_session_status AS ENUM ('dijadwalkan','berlangsung','selesai','rekaman_tersedia');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE attendance_status AS ENUM ('belum','hadir','terlambat','absen');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE calendar_event_sumber AS ENUM ('live_session','tugas','kuis','lainnya');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── live_sessions ──
  pgm.sql(`
    CREATE TABLE live_sessions (
      id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id                       uuid REFERENCES courses(id) ON DELETE CASCADE,
      cohort_id                       uuid REFERENCES cohorts(id) ON DELETE CASCADE,
      judul                           varchar(200) NOT NULL,
      deskripsi                       text,
      penyedia                        live_session_penyedia NOT NULL DEFAULT 'zoom',
      url_join                        text NOT NULL,
      host_user_id                    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      waktu_mulai                     timestamptz NOT NULL,
      waktu_selesai                   timestamptz NOT NULL,
      kapasitas_maks                  integer,
      toleransi_terlambat_menit       smallint NOT NULL DEFAULT 15,
      status                          live_session_status NOT NULL DEFAULT 'dijadwalkan',
      dibuat_oleh                     uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at                      timestamptz NOT NULL DEFAULT now(),
      updated_at                      timestamptz NOT NULL DEFAULT now(),
      deleted_at                      timestamptz,
      CONSTRAINT live_sessions_cakupan_chk CHECK (course_id IS NOT NULL OR cohort_id IS NOT NULL),
      CONSTRAINT live_sessions_waktu_chk CHECK (waktu_selesai > waktu_mulai),
      CONSTRAINT live_sessions_kapasitas_chk CHECK (kapasitas_maks IS NULL OR kapasitas_maks > 0)
    );
    CREATE INDEX live_sessions_course_idx ON live_sessions (course_id);
    CREATE INDEX live_sessions_cohort_idx ON live_sessions (cohort_id);
    CREATE INDEX live_sessions_penyedia_idx ON live_sessions (penyedia);
    CREATE INDEX live_sessions_host_idx ON live_sessions (host_user_id);
    CREATE INDEX live_sessions_waktu_mulai_idx ON live_sessions (waktu_mulai);
    CREATE INDEX live_sessions_waktu_selesai_idx ON live_sessions (waktu_selesai);
    CREATE INDEX live_sessions_status_idx ON live_sessions (status);
    CREATE INDEX live_sessions_dibuat_oleh_idx ON live_sessions (dibuat_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── session_attendance (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE session_attendance (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      live_session_id         uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status                  attendance_status NOT NULL DEFAULT 'belum',
      waktu_join              timestamptz,
      waktu_leave             timestamptz,
      durasi_hadir_menit      integer NOT NULL DEFAULT 0,
      ditandai_manual         boolean NOT NULL DEFAULT false,
      ditandai_oleh           uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT session_attendance_durasi_chk CHECK (durasi_hadir_menit >= 0),
      CONSTRAINT session_attendance_waktu_chk CHECK (waktu_leave IS NULL OR waktu_join IS NULL OR waktu_leave >= waktu_join),
      UNIQUE (live_session_id, user_id)
    );
    CREATE INDEX session_attendance_live_session_idx ON session_attendance (live_session_id);
    CREATE INDEX session_attendance_user_idx ON session_attendance (user_id);
    CREATE INDEX session_attendance_status_idx ON session_attendance (status);
    CREATE INDEX session_attendance_ditandai_oleh_idx ON session_attendance (ditandai_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON session_attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── recordings ──
  pgm.sql(`
    CREATE TABLE recordings (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      live_session_id       uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
      url                   text NOT NULL,
      durasi_menit          integer,
      ukuran_bytes          bigint,
      status_jadi_materi    boolean NOT NULL DEFAULT false,
      lesson_id             uuid REFERENCES lessons(id) ON DELETE SET NULL,
      retensi_hingga        timestamptz,
      diunggah_oleh         uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT recordings_durasi_chk CHECK (durasi_menit IS NULL OR durasi_menit >= 0),
      CONSTRAINT recordings_ukuran_chk CHECK (ukuran_bytes IS NULL OR ukuran_bytes >= 0)
    );
    CREATE INDEX recordings_live_session_idx ON recordings (live_session_id);
    CREATE INDEX recordings_status_jadi_materi_idx ON recordings (status_jadi_materi);
    CREATE INDEX recordings_lesson_idx ON recordings (lesson_id);
    CREATE INDEX recordings_retensi_idx ON recordings (retensi_hingga);
    CREATE INDEX recordings_diunggah_oleh_idx ON recordings (diunggah_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON recordings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── calendar_events ──
  pgm.sql(`
    CREATE TABLE calendar_events (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sumber              calendar_event_sumber NOT NULL,
      source_id           uuid,
      course_id           uuid REFERENCES courses(id) ON DELETE CASCADE,
      judul               varchar(200) NOT NULL,
      waktu_mulai         timestamptz NOT NULL,
      waktu_selesai       timestamptz,
      is_sepanjang_hari   boolean NOT NULL DEFAULT false,
      meta                jsonb,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT calendar_events_waktu_chk CHECK (waktu_selesai IS NULL OR waktu_selesai >= waktu_mulai)
    );
    CREATE INDEX calendar_events_sumber_idx ON calendar_events (sumber);
    CREATE INDEX calendar_events_sumber_source_idx ON calendar_events (sumber, source_id);
    CREATE INDEX calendar_events_course_idx ON calendar_events (course_id);
    CREATE INDEX calendar_events_waktu_mulai_idx ON calendar_events (waktu_mulai);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS calendar_events;`);
  pgm.sql(`DROP TABLE IF EXISTS recordings;`);
  pgm.sql(`DROP TABLE IF EXISTS session_attendance;`);
  pgm.sql(`DROP TABLE IF EXISTS live_sessions;`);
  pgm.sql(`DROP TYPE IF EXISTS calendar_event_sumber;`);
  pgm.sql(`DROP TYPE IF EXISTS attendance_status;`);
  pgm.sql(`DROP TYPE IF EXISTS live_session_status;`);
  pgm.sql(`DROP TYPE IF EXISTS live_session_penyedia;`);
}
