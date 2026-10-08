/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 10 — Notifikasi & Reminder
 * notification_event_config, notifications, notification_recipients, reminders,
 * reminder_tracking, announcements, messages.
 * `kanal_notifikasi` sudah didefinisikan di domain 00 (0000_extensions_base.ts).
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE reminder_sumber AS ENUM ('jadwal_live','tenggat_tugas','tagihan','lainnya');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE reminder_pengulangan AS ENUM ('tidak','harian','mingguan','bulanan');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── notification_event_config ──
  // Catatan: `jenis_event` memakai UNIQUE penuh (bukan partial) karena kolom ini menjadi target
  // FOREIGN KEY dari `notifications.jenis_event` — PostgreSQL mensyaratkan constraint UNIQUE penuh
  // (bukan sekadar partial unique index) sebagai target FK.
  pgm.sql(`
    CREATE TABLE notification_event_config (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      jenis_event         citext NOT NULL,
      name                varchar(150) NOT NULL,
      description           text,
      role_penerima       jsonb NOT NULL DEFAULT '[]',
      kanal               jsonb NOT NULL DEFAULT '[]',
      template_judul      text NOT NULL,
      template_isi        text NOT NULL,
      butuh_respons       boolean NOT NULL DEFAULT false,
      is_kritikal         boolean NOT NULL DEFAULT false,
      is_active            boolean NOT NULL DEFAULT true,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      UNIQUE (jenis_event)
    );
    CREATE INDEX notification_event_config_is_aktif_idx ON notification_event_config (is_active);
    CREATE INDEX notification_event_config_role_gin_idx ON notification_event_config USING GIN (role_penerima);
    CREATE INDEX notification_event_config_kanal_gin_idx ON notification_event_config USING GIN (kanal);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_event_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── notifications ──
  pgm.sql(`
    CREATE TABLE notifications (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      jenis_event     citext NOT NULL REFERENCES notification_event_config(jenis_event) ON DELETE RESTRICT,
      title           text NOT NULL,
      isi             text NOT NULL,
      payload         jsonb,
      source_type     varchar(50),
      source_id       uuid,
      waktu           timestamptz NOT NULL DEFAULT now(),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE INDEX notifications_jenis_event_idx ON notifications (jenis_event);
    CREATE INDEX notifications_source_idx ON notifications (source_type, source_id);
    CREATE INDEX notifications_waktu_idx ON notifications (waktu);
    CREATE INDEX notifications_payload_gin_idx ON notifications USING GIN (payload);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── notification_recipients (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE notification_recipients (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id       uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kanal                 kanal_notifikasi NOT NULL DEFAULT 'in_app',
      status_dibaca         boolean NOT NULL DEFAULT false,
      waktu_dibaca          timestamptz,
      status_direspons      boolean NOT NULL DEFAULT false,
      waktu_direspons       timestamptz,
      isi_respons           text,
      status_kirim          varchar(20) NOT NULL DEFAULT 'antri',
      terkirim_at           timestamptz,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT notification_recipients_status_kirim_chk CHECK (status_kirim IN ('antri','terkirim','gagal')),
      CONSTRAINT notification_recipients_dibaca_chk CHECK (
        (status_dibaca = false AND waktu_dibaca IS NULL) OR (status_dibaca = true AND waktu_dibaca IS NOT NULL)
      ),
      CONSTRAINT notification_recipients_direspons_chk CHECK (
        (status_direspons = false AND waktu_direspons IS NULL) OR (status_direspons = true AND waktu_direspons IS NOT NULL)
      ),
      UNIQUE (notification_id, user_id, kanal)
    );
    CREATE INDEX notification_recipients_notification_idx ON notification_recipients (notification_id);
    CREATE INDEX notification_recipients_user_idx ON notification_recipients (user_id);
    CREATE INDEX notification_recipients_kanal_idx ON notification_recipients (kanal);
    CREATE INDEX notification_recipients_status_dibaca_idx ON notification_recipients (status_dibaca);
    CREATE INDEX notification_recipients_status_direspons_idx ON notification_recipients (status_direspons);
    CREATE INDEX notification_recipients_status_kirim_idx ON notification_recipients (status_kirim);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_recipients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── reminders ──
  pgm.sql(`
    CREATE TABLE reminders (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sumber              reminder_sumber NOT NULL,
      source_id           uuid,
      title               varchar(200) NOT NULL,
      description           text,
      jatuh_tempo         timestamptz NOT NULL,
      pengulangan         reminder_pengulangan NOT NULL DEFAULT 'tidak',
      interval_kustom     interval,
      aturan_eskalasi     jsonb,
      is_active            boolean NOT NULL DEFAULT true,
      next_run_at         timestamptz,
      created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz
    );
    CREATE INDEX reminders_sumber_idx ON reminders (sumber);
    CREATE INDEX reminders_sumber_source_idx ON reminders (sumber, source_id);
    CREATE INDEX reminders_jatuh_tempo_idx ON reminders (jatuh_tempo);
    CREATE INDEX reminders_next_run_idx ON reminders (next_run_at);
    CREATE INDEX reminders_is_aktif_idx ON reminders (is_active);
    CREATE INDEX reminders_created_by_idx ON reminders (created_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── reminder_tracking (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE reminder_tracking (
      id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reminder_id               uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
      user_id                   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status_dibaca             boolean NOT NULL DEFAULT false,
      waktu_dibaca              timestamptz,
      status_direspons          boolean NOT NULL DEFAULT false,
      waktu_direspons           timestamptz,
      isi_respons               text,
      oleh_user_id              uuid REFERENCES users(id) ON DELETE SET NULL,
      level_eskalasi            smallint NOT NULL DEFAULT 0,
      terakhir_eskalasi_at      timestamptz,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT reminder_tracking_level_chk CHECK (level_eskalasi >= 0),
      CONSTRAINT reminder_tracking_dibaca_chk CHECK (
        (status_dibaca = false AND waktu_dibaca IS NULL) OR (status_dibaca = true AND waktu_dibaca IS NOT NULL)
      ),
      CONSTRAINT reminder_tracking_direspons_chk CHECK (
        (status_direspons = false AND waktu_direspons IS NULL) OR (status_direspons = true AND waktu_direspons IS NOT NULL)
      ),
      UNIQUE (reminder_id, user_id)
    );
    CREATE INDEX reminder_tracking_reminder_idx ON reminder_tracking (reminder_id);
    CREATE INDEX reminder_tracking_user_idx ON reminder_tracking (user_id);
    CREATE INDEX reminder_tracking_oleh_user_idx ON reminder_tracking (oleh_user_id);
    CREATE INDEX reminder_tracking_status_dibaca_idx ON reminder_tracking (status_dibaca);
    CREATE INDEX reminder_tracking_level_eskalasi_idx ON reminder_tracking (level_eskalasi);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON reminder_tracking FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── announcements ──
  pgm.sql(`
    CREATE TABLE announcements (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title               varchar(200) NOT NULL,
      isi                 text NOT NULL,
      segmen              jsonb NOT NULL DEFAULT '[]',
      tanggal_mulai       timestamptz NOT NULL DEFAULT now(),
      tanggal_selesai     timestamptz,
      is_active            boolean NOT NULL DEFAULT true,
      dibuat_oleh         uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT announcements_tanggal_chk CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai)
    );
    CREATE INDEX announcements_tanggal_mulai_idx ON announcements (tanggal_mulai);
    CREATE INDEX announcements_tanggal_selesai_idx ON announcements (tanggal_selesai);
    CREATE INDEX announcements_is_aktif_idx ON announcements (is_active);
    CREATE INDEX announcements_dibuat_oleh_idx ON announcements (dibuat_oleh);
    CREATE INDEX announcements_segmen_gin_idx ON announcements USING GIN (segmen);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── messages (self-FK thread) ──
  pgm.sql(`
    CREATE TABLE messages (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      pengirim_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      penerima_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subjek                varchar(200),
      isi                   text NOT NULL,
      status_dibaca         boolean NOT NULL DEFAULT false,
      waktu_dibaca          timestamptz,
      parent_message_id     uuid REFERENCES messages(id) ON DELETE CASCADE,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT messages_dibaca_chk CHECK (
        (status_dibaca = false AND waktu_dibaca IS NULL) OR (status_dibaca = true AND waktu_dibaca IS NOT NULL)
      ),
      CONSTRAINT messages_no_self_send_chk CHECK (pengirim_user_id <> penerima_user_id)
    );
    CREATE INDEX messages_pengirim_idx ON messages (pengirim_user_id);
    CREATE INDEX messages_penerima_idx ON messages (penerima_user_id);
    CREATE INDEX messages_parent_idx ON messages (parent_message_id);
    CREATE INDEX messages_status_dibaca_idx ON messages (status_dibaca);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed konfigurasi event contoh ──
  pgm.sql(`
    INSERT INTO notification_event_config (jenis_event, name, description, role_penerima, kanal, template_judul, template_isi, butuh_respons, is_kritikal) VALUES
      ('student.mendaftar', 'Student Baru Mendaftar', 'Student baru mendaftar/checkout',
        '["admin_ops","instructor"]'::jsonb, '["in_app","email"]'::jsonb,
        'Student baru mendaftar', '{{nama_siswa}} mendaftar pada course {{course}}.', false, false),
      ('order.manual_masuk', 'Order Manual Masuk', 'Tanda jadi manual diinput marketing',
        '["admin_ops","direktur"]'::jsonb, '["in_app","email","whatsapp"]'::jsonb,
        'Tanda jadi manual masuk', 'Order {{nomor_order}} senilai {{nominal}} diinput manual oleh {{marketing}}.', false, true),
      ('payment.terverifikasi', 'Payment Terverifikasi', 'Payment/DP diverifikasi',
        '["student"]'::jsonb, '["in_app","email","whatsapp"]'::jsonb,
        'Payment terverifikasi', 'Payment order {{nomor_order}} sebesar {{nominal}} telah diverifikasi.', false, true),
      ('assignment.dikumpulkan', 'Assignment Dikumpulkan', 'Submission assignment masuk',
        '["instructor","asisten"]'::jsonb, '["in_app"]'::jsonb,
        'Assignment baru dikumpulkan', '{{nama_siswa}} mengumpulkan assignment {{assignment}}.', false, false),
      ('nilai.dirilis', 'Nilai Dirilis', 'Nilai/feedback tersedia',
        '["student"]'::jsonb, '["in_app","email"]'::jsonb,
        'Nilai Anda telah dirilis', 'Nilai untuk {{assessment}} telah tersedia.', false, false),
      ('certificate.terbit', 'Certificate Terbit', 'Certificate kelulusan terbit',
        '["student"]'::jsonb, '["in_app","email"]'::jsonb,
        'Certificate Anda telah terbit', 'Certificate course {{course}} telah terbit, nomor {{certificate_number}}.', false, false),
      ('komisi.cair', 'Komisi Cair', 'Komisi marketing dicairkan',
        '["marketing"]'::jsonb, '["in_app","email","whatsapp"]'::jsonb,
        'Komisi Anda telah cair', 'Komisi sebesar {{nominal}} telah dicairkan.', false, true),
      ('refund.diajukan', 'Refund Diajukan', 'Butuh approval Direktur',
        '["direktur"]'::jsonb, '["in_app","email"]'::jsonb,
        'Pengajuan refund baru', 'Refund order {{nomor_order}} senilai {{nominal}} menunggu approval.', true, true),
      ('live_session.h1', 'Reminder Live Session H-1', 'Reminder jadwal live H-1/H-1 jam',
        '["student","instructor"]'::jsonb, '["push","whatsapp"]'::jsonb,
        'Kelas live akan segera dimulai', 'Sesi {{judul_sesi}} dimulai {{start_time}}.', false, false),
      ('tagihan.jatuh_tempo', 'Tagihan Jatuh Tempo', 'Reminder cicilan jatuh tempo',
        '["student","admin_ops"]'::jsonb, '["in_app","whatsapp"]'::jsonb,
        'Tagihan Anda akan jatuh tempo', 'Cicilan order {{nomor_order}} jatuh tempo {{jatuh_tempo}}.', false, false),
      ('kelas.tidak_dilanjutkan', 'Kelas Tidak Dilanjutkan', 'Student tidak aktif belajar N hari',
        '["student"]'::jsonb, '["push","email"]'::jsonb,
        'Yuk lanjutkan belajarmu', 'Kamu belum melanjutkan course {{course}} selama beberapa hari.', false, false)
    ON CONFLICT (jenis_event) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS messages;`);
  pgm.sql(`DROP TABLE IF EXISTS announcements;`);
  pgm.sql(`DROP TABLE IF EXISTS reminder_tracking;`);
  pgm.sql(`DROP TABLE IF EXISTS reminders;`);
  pgm.sql(`DROP TABLE IF EXISTS notification_recipients;`);
  pgm.sql(`DROP TABLE IF EXISTS notifications;`);
  pgm.sql(`DROP TABLE IF EXISTS notification_event_config;`);
  pgm.sql(`DROP TYPE IF EXISTS reminder_pengulangan;`);
  pgm.sql(`DROP TYPE IF EXISTS reminder_sumber;`);
}
