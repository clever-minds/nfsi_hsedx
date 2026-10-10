/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 10 — Notifikasi & Reminder
 * notification_event_config, notifications, notification_recipients, reminders,
 * reminder_tracking, announcements, messages.
 * `channel_notification` sudah didefinisikan di domain 00 (0000_extensions_base.ts).
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE reminder_source AS ENUM ('live_schedule','assignment_deadline','invoice','other');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE reminder_repetition AS ENUM ('none','daily','weekly','monthly');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── notification_event_config ──
  // Catatan: `event_type` memakai UNIQUE penuh (bukan partial) karena kolom ini menjadi target
  // FOREIGN KEY from `notifications.event_type` — PostgreSQL mensyaratkan constraint UNIQUE penuh
  // (bukan sekadar partial unique index) sebagai target FK.
  pgm.sql(`
    CREATE TABLE notification_event_config (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type         citext NOT NULL,
      name                varchar(150) NOT NULL,
      description           text,
      role_recipient       jsonb NOT NULL DEFAULT '[]',
      channel               jsonb NOT NULL DEFAULT '[]',
      template_title      text NOT NULL,
      template_content        text NOT NULL,
      needs_response       boolean NOT NULL DEFAULT false,
      is_critical         boolean NOT NULL DEFAULT false,
      is_active            boolean NOT NULL DEFAULT true,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      UNIQUE (event_type)
    );
    CREATE INDEX notification_event_config_is_aktif_idx ON notification_event_config (is_active);
    CREATE INDEX notification_event_config_role_gin_idx ON notification_event_config USING GIN (role_recipient);
    CREATE INDEX notification_event_config_channel_gin_idx ON notification_event_config USING GIN (channel);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_event_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── notifications ──
  pgm.sql(`
    CREATE TABLE notifications (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type     citext NOT NULL REFERENCES notification_event_config(event_type) ON DELETE RESTRICT,
      title           text NOT NULL,
      content             text NOT NULL,
      payload         jsonb,
      source_type     varchar(50),
      source_id       uuid,
      time           timestamptz NOT NULL DEFAULT now(),
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );
    CREATE INDEX notifications_type_event_idx ON notifications (event_type);
    CREATE INDEX notifications_source_idx ON notifications (source_type, source_id);
    CREATE INDEX notifications_time_idx ON notifications (time);
    CREATE INDEX notifications_payload_gin_idx ON notifications USING GIN (payload);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── notification_recipients (tanpa soft delete) ──
  pgm.sql(`
    CREATE TABLE notification_recipients (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id       uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel                 channel_notification NOT NULL DEFAULT 'in_app',
      is_read         boolean NOT NULL DEFAULT false,
      read_time          timestamptz,
      is_responded      boolean NOT NULL DEFAULT false,
      responded_time       timestamptz,
      response_content           text,
      send_status          varchar(20) NOT NULL DEFAULT 'queued',
      sent_at           timestamptz,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT notification_recipients_send_status_chk CHECK (send_status IN ('queued','sent','failed')),
      CONSTRAINT notification_recipients_read_chk CHECK (
        (is_read = false AND read_time IS NULL) OR (is_read = true AND read_time IS NOT NULL)
      ),
      CONSTRAINT notification_recipients_direspons_chk CHECK (
        (is_responded = false AND responded_time IS NULL) OR (is_responded = true AND responded_time IS NOT NULL)
      ),
      UNIQUE (notification_id, user_id, channel)
    );
    CREATE INDEX notification_recipients_notification_idx ON notification_recipients (notification_id);
    CREATE INDEX notification_recipients_user_idx ON notification_recipients (user_id);
    CREATE INDEX notification_recipients_channel_idx ON notification_recipients (channel);
    CREATE INDEX notification_recipients_status_read_idx ON notification_recipients (is_read);
    CREATE INDEX notification_recipients_is_responded_idx ON notification_recipients (is_responded);
    CREATE INDEX notification_recipients_send_status_idx ON notification_recipients (send_status);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON notification_recipients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── reminders ──
  pgm.sql(`
    CREATE TABLE reminders (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source              reminder_source NOT NULL,
      source_id           uuid,
      title               varchar(200) NOT NULL,
      description           text,
      due_date         timestamptz NOT NULL,
      repetition         reminder_repetition NOT NULL DEFAULT 'none',
      custom_interval     interval,
      escalation_rules     jsonb,
      is_active            boolean NOT NULL DEFAULT true,
      next_run_at         timestamptz,
      created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz
    );
    CREATE INDEX reminders_source_idx ON reminders (source);
    CREATE INDEX reminders_source_source_idx ON reminders (source, source_id);
    CREATE INDEX reminders_due_date_idx ON reminders (due_date);
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
      is_read             boolean NOT NULL DEFAULT false,
      read_time              timestamptz,
      is_responded          boolean NOT NULL DEFAULT false,
      responded_time           timestamptz,
      response_content               text,
      by_user_id              uuid REFERENCES users(id) ON DELETE SET NULL,
      level_escalation            smallint NOT NULL DEFAULT 0,
      last_escalation_at      timestamptz,
      created_at                timestamptz NOT NULL DEFAULT now(),
      updated_at                timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT reminder_tracking_level_chk CHECK (level_escalation >= 0),
      CONSTRAINT reminder_tracking_read_chk CHECK (
        (is_read = false AND read_time IS NULL) OR (is_read = true AND read_time IS NOT NULL)
      ),
      CONSTRAINT reminder_tracking_direspons_chk CHECK (
        (is_responded = false AND responded_time IS NULL) OR (is_responded = true AND responded_time IS NOT NULL)
      ),
      UNIQUE (reminder_id, user_id)
    );
    CREATE INDEX reminder_tracking_reminder_idx ON reminder_tracking (reminder_id);
    CREATE INDEX reminder_tracking_user_idx ON reminder_tracking (user_id);
    CREATE INDEX reminder_tracking_by_user_idx ON reminder_tracking (by_user_id);
    CREATE INDEX reminder_tracking_status_read_idx ON reminder_tracking (is_read);
    CREATE INDEX reminder_tracking_level_escalation_idx ON reminder_tracking (level_escalation);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON reminder_tracking FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── announcements ──
  pgm.sql(`
    CREATE TABLE announcements (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title               varchar(200) NOT NULL,
      content                 text NOT NULL,
      segment              jsonb NOT NULL DEFAULT '[]',
      start_date       timestamptz NOT NULL DEFAULT now(),
      end_date     timestamptz,
      is_active            boolean NOT NULL DEFAULT true,
      created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT announcements_date_chk CHECK (end_date IS NULL OR end_date >= start_date)
    );
    CREATE INDEX announcements_date_start_idx ON announcements (start_date);
    CREATE INDEX announcements_date_finish_idx ON announcements (end_date);
    CREATE INDEX announcements_is_aktif_idx ON announcements (is_active);
    CREATE INDEX announcements_created_by_idx ON announcements (created_by);
    CREATE INDEX announcements_segment_gin_idx ON announcements USING GIN (segment);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── messages (self-FK thread) ──
  pgm.sql(`
    CREATE TABLE messages (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject                varchar(200),
      content                   text NOT NULL,
      is_read         boolean NOT NULL DEFAULT false,
      read_time          timestamptz,
      parent_message_id     uuid REFERENCES messages(id) ON DELETE CASCADE,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT messages_read_chk CHECK (
        (is_read = false AND read_time IS NULL) OR (is_read = true AND read_time IS NOT NULL)
      ),
      CONSTRAINT messages_no_self_send_chk CHECK (sender_user_id <> recipient_user_id)
    );
    CREATE INDEX messages_sender_idx ON messages (sender_user_id);
    CREATE INDEX messages_recipient_idx ON messages (recipient_user_id);
    CREATE INDEX messages_parent_idx ON messages (parent_message_id);
    CREATE INDEX messages_status_read_idx ON messages (is_read);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── seed konfigurasi event contoh ──
  pgm.sql(`
    INSERT INTO notification_event_config (event_type, name, description, role_recipient, channel, template_title, template_content, needs_response, is_critical) VALUES
      ('student.mendaftar', 'Student Baru Mendaftar', 'Student baru mendaftar/checkout',
        '["operations_admin","instructor"]'::jsonb, '["in_app","email"]'::jsonb,
        'Student baru mendaftar', '{{name_siswa}} mendaftar pada course {{course}}.', false, false),
      ('order.manual_masuk', 'Order Manual login', 'Tanda jadi manual diinput marketing',
        '["operations_admin","director"]'::jsonb, '["in_app","email","whatsapp"]'::jsonb,
        'Tanda jadi manual login', 'Order {{number_order}} senilai {{amount}} diinput manual by {{marketing}}.', false, true),
      ('payment.terverifikasi', 'Payment Terverifikasi', 'Payment/DP diverifikasi',
        '["student"]'::jsonb, '["in_app","email","whatsapp"]'::jsonb,
        'Payment terverifikasi', 'Payment order {{number_order}} sebesar {{amount}} telah diverifikasi.', false, true),
      ('assignment.dikumpulkan', 'Assignment Dikumpulkan', 'Submission assignment login',
        '["instructor","assistant"]'::jsonb, '["in_app"]'::jsonb,
        'Assignment baru dikumpulkan', '{{name_siswa}} mengumpulkan assignment {{assignment}}.', false, false),
      ('value.dirilis', 'grade Dirilis', 'grade/feedback tersedia',
        '["student"]'::jsonb, '["in_app","email"]'::jsonb,
        'grade Anda telah dirilis', 'grade untuk {{assessment}} telah tersedia.', false, false),
      ('certificate.publish', 'Certificate Terbit', 'Certificate kelulusan publish',
        '["student"]'::jsonb, '["in_app","email"]'::jsonb,
        'Certificate Anda telah publish', 'Certificate course {{course}} telah publish, number {{certificate_number}}.', false, false),
      ('commission.cair', 'Komisi Cair', 'Komisi marketing dicairkan',
        '["marketing"]'::jsonb, '["in_app","email","whatsapp"]'::jsonb,
        'Komisi Anda telah cair', 'Komisi sebesar {{amount}} telah dicairkan.', false, true),
      ('refund.diajukan', 'Refund Diajukan', 'Butuh approval Direktur',
        '["director"]'::jsonb, '["in_app","email"]'::jsonb,
        'Pengajuan refund baru', 'Refund order {{number_order}} senilai {{amount}} menunggu approval.', true, true),
      ('live_session.h1', 'Reminder Live Session H-1', 'Reminder jadwal live H-1/H-1 jam',
        '["student","instructor"]'::jsonb, '["push","whatsapp"]'::jsonb,
        'class live akan segera dimulai', 'Sesi {{title_sesi}} dimulai {{start_time}}.', false, false),
      ('invoice.due_date', 'invoice Jatuh Tempo', 'Reminder cicilan due date',
        '["student","operations_admin"]'::jsonb, '["in_app","whatsapp"]'::jsonb,
        'invoice Anda akan due date', 'Cicilan order {{number_order}} due date {{due_date}}.', false, false),
      ('class.tidak_dilanjutkan', 'class no Dilanjutkan', 'Student no active belajar N hari',
        '["student"]'::jsonb, '["push","email"]'::jsonb,
        'Yuk continue belajarmu', 'Kamu belum melanjutkan course {{course}} selama beberapa hari.', false, false)
    ON CONFLICT (event_type) DO NOTHING;
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
  pgm.sql(`DROP TYPE IF EXISTS reminder_repetition;`);
  pgm.sql(`DROP TYPE IF EXISTS reminder_source;`);
}
