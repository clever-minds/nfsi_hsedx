/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 07 — Diskusi & Komunitas
 * discussion_threads, discussion_posts, qa_questions, qa_answers, comments, reactions,
 * moderation_reports.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE moderation_status AS ENUM ('menunggu','ditinjau','ditindak','ditolak');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE moderation_tindakan AS ENUM ('sembunyikan','hapus','blokir_pengguna');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── discussion_threads ──
  pgm.sql(`
    CREATE TABLE discussion_threads (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id       uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      judul           varchar(200) NOT NULL,
      dibuat_oleh     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_pinned       boolean NOT NULL DEFAULT false,
      is_locked       boolean NOT NULL DEFAULT false,
      jumlah_post     integer NOT NULL DEFAULT 0,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz,
      CONSTRAINT discussion_threads_jumlah_post_chk CHECK (jumlah_post >= 0)
    );
    CREATE INDEX discussion_threads_course_idx ON discussion_threads (course_id);
    CREATE INDEX discussion_threads_dibuat_oleh_idx ON discussion_threads (dibuat_oleh);
    CREATE INDEX discussion_threads_is_pinned_idx ON discussion_threads (is_pinned);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON discussion_threads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── discussion_posts (self-FK balasan berjenjang) ──
  pgm.sql(`
    CREATE TABLE discussion_posts (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id         uuid NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
      parent_post_id    uuid REFERENCES discussion_posts(id) ON DELETE CASCADE,
      user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      isi               text NOT NULL,
      is_hidden         boolean NOT NULL DEFAULT false,
      hidden_reason     text,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );
    CREATE INDEX discussion_posts_thread_idx ON discussion_posts (thread_id);
    CREATE INDEX discussion_posts_parent_idx ON discussion_posts (parent_post_id);
    CREATE INDEX discussion_posts_user_idx ON discussion_posts (user_id);
    CREATE INDEX discussion_posts_is_hidden_idx ON discussion_posts (is_hidden);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON discussion_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── qa_questions ──
  pgm.sql(`
    CREATE TABLE qa_questions (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lesson_id           uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      isi                 text NOT NULL,
      status_terjawab     boolean NOT NULL DEFAULT false,
      jumlah_upvote       integer NOT NULL DEFAULT 0,
      is_hidden           boolean NOT NULL DEFAULT false,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      CONSTRAINT qa_questions_upvote_chk CHECK (jumlah_upvote >= 0)
    );
    CREATE INDEX qa_questions_lesson_idx ON qa_questions (lesson_id);
    CREATE INDEX qa_questions_user_idx ON qa_questions (user_id);
    CREATE INDEX qa_questions_status_terjawab_idx ON qa_questions (status_terjawab);
    CREATE INDEX qa_questions_upvote_idx ON qa_questions (jumlah_upvote);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON qa_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── qa_answers ──
  pgm.sql(`
    CREATE TABLE qa_answers (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id                 uuid NOT NULL REFERENCES qa_questions(id) ON DELETE CASCADE,
      user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      isi                         text NOT NULL,
      is_instruktur_jawaban       boolean NOT NULL DEFAULT false,
      jumlah_upvote               integer NOT NULL DEFAULT 0,
      is_hidden                   boolean NOT NULL DEFAULT false,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      deleted_at                  timestamptz,
      CONSTRAINT qa_answers_upvote_chk CHECK (jumlah_upvote >= 0)
    );
    CREATE INDEX qa_answers_question_idx ON qa_answers (question_id);
    CREATE INDEX qa_answers_user_idx ON qa_answers (user_id);
    CREATE INDEX qa_answers_instruktur_idx ON qa_answers (is_instruktur_jawaban);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON qa_answers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── comments (polymorphic target) ──
  pgm.sql(`
    CREATE TABLE comments (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      target_type     varchar(30) NOT NULL,
      target_id       uuid NOT NULL,
      user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      isi             text NOT NULL,
      is_hidden       boolean NOT NULL DEFAULT false,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz,
      CONSTRAINT comments_target_type_chk CHECK (target_type IN ('lesson_content','discussion_post','qa_answer'))
    );
    CREATE INDEX comments_target_idx ON comments (target_type, target_id);
    CREATE INDEX comments_user_idx ON comments (user_id);
    CREATE INDEX comments_is_hidden_idx ON comments (is_hidden);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── reactions (polymorphic target, tanpa updated_at/deleted_at) ──
  pgm.sql(`
    CREATE TABLE reactions (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      target_type     varchar(30) NOT NULL,
      target_id       uuid NOT NULL,
      user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      jenis           varchar(20) NOT NULL DEFAULT 'suka',
      created_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT reactions_target_type_chk CHECK (target_type IN ('discussion_post','qa_question','qa_answer','comment')),
      CONSTRAINT reactions_jenis_chk CHECK (jenis IN ('suka','sayang','wow','lucu')),
      UNIQUE (target_type, target_id, user_id)
    );
    CREATE INDEX reactions_target_idx ON reactions (target_type, target_id);
    CREATE INDEX reactions_user_idx ON reactions (user_id);
  `);

  // ── moderation_reports (polymorphic target) ──
  pgm.sql(`
    CREATE TABLE moderation_reports (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      target_type             varchar(30) NOT NULL,
      target_id                uuid NOT NULL,
      pelapor_user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alasan                   text NOT NULL,
      status                   moderation_status NOT NULL DEFAULT 'menunggu',
      tindakan                 moderation_tindakan,
      ditangani_oleh           uuid REFERENCES users(id) ON DELETE SET NULL,
      catatan_penanganan       text,
      ditangani_at             timestamptz,
      created_at               timestamptz NOT NULL DEFAULT now(),
      updated_at               timestamptz NOT NULL DEFAULT now(),
      deleted_at               timestamptz,
      CONSTRAINT moderation_reports_target_type_chk CHECK (target_type IN ('discussion_post','qa_question','qa_answer','comment')),
      CONSTRAINT moderation_reports_tindakan_lengkap_chk CHECK (
        status <> 'ditindak' OR (tindakan IS NOT NULL AND ditangani_oleh IS NOT NULL AND ditangani_at IS NOT NULL)
      )
    );
    CREATE INDEX moderation_reports_target_idx ON moderation_reports (target_type, target_id);
    CREATE INDEX moderation_reports_pelapor_idx ON moderation_reports (pelapor_user_id);
    CREATE INDEX moderation_reports_status_idx ON moderation_reports (status);
    CREATE INDEX moderation_reports_tindakan_idx ON moderation_reports (tindakan);
    CREATE INDEX moderation_reports_ditangani_oleh_idx ON moderation_reports (ditangani_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON moderation_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS moderation_reports;`);
  pgm.sql(`DROP TABLE IF EXISTS reactions;`);
  pgm.sql(`DROP TABLE IF EXISTS comments;`);
  pgm.sql(`DROP TABLE IF EXISTS qa_answers;`);
  pgm.sql(`DROP TABLE IF EXISTS qa_questions;`);
  pgm.sql(`DROP TABLE IF EXISTS discussion_posts;`);
  pgm.sql(`DROP TABLE IF EXISTS discussion_threads;`);
  pgm.sql(`DROP TYPE IF EXISTS moderation_tindakan;`);
  pgm.sql(`DROP TYPE IF EXISTS moderation_status;`);
}
