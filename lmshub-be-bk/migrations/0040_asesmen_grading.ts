/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 04 — Asesmen & Grading
 * question_banks, questions, question_options, quizzes, quiz_questions, assignments, rubrics,
 * quiz_attempts, attempt_answers, submissions, grades, gradebook_entries.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE question_tipe AS ENUM
      ('pilihan_tunggal','pilihan_ganda','benar_salah','isian_singkat','esai','upload_file','pencocokan');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE quiz_attempt_status AS ENUM ('belum_dikerjakan','sedang','dikumpulkan','dinilai');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE submission_status AS ENUM ('belum','dikumpulkan','dinilai','revisi_diminta');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE tipe_pengumpulan AS ENUM ('file','teks','url','campuran');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── question_banks ──
  pgm.sql(`
    CREATE TABLE question_banks (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nama          varchar(150) NOT NULL,
      course_id     uuid REFERENCES courses(id) ON DELETE CASCADE,
      category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
      deskripsi     text,
      created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      deleted_at    timestamptz,
      CONSTRAINT question_banks_cakupan_chk CHECK (course_id IS NOT NULL OR category_id IS NOT NULL)
    );
    CREATE INDEX question_banks_course_idx ON question_banks (course_id);
    CREATE INDEX question_banks_category_idx ON question_banks (category_id);
    CREATE INDEX question_banks_created_by_idx ON question_banks (created_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON question_banks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── questions & question_options (pasangan induk-anak) ──
  pgm.sql(`
    CREATE TABLE questions (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_bank_id      uuid NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
      tipe                  question_tipe NOT NULL,
      teks_soal             text NOT NULL,
      poin                  numeric(6,2) NOT NULL DEFAULT 1,
      penjelasan_jawaban    text,
      meta                  jsonb,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT questions_poin_chk CHECK (poin >= 0)
    );
    CREATE INDEX questions_bank_idx ON questions (question_bank_id);
    CREATE INDEX questions_tipe_idx ON questions (tipe);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE question_options (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id       uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      teks_opsi         text NOT NULL,
      is_benar          boolean NOT NULL DEFAULT false,
      pasangan_key      varchar(50),
      urutan            smallint NOT NULL DEFAULT 0,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );
    CREATE INDEX question_options_question_idx ON question_options (question_id);
    CREATE INDEX question_options_is_benar_idx ON question_options (is_benar);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON question_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── quizzes ──
  pgm.sql(`
    CREATE TABLE quizzes (
      id                                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id                            uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      section_id                           uuid REFERENCES sections(id) ON DELETE SET NULL,
      lesson_id                            uuid REFERENCES lessons(id) ON DELETE SET NULL,
      judul                                varchar(200) NOT NULL,
      deskripsi                            text,
      batas_waktu_menit                    integer,
      acak_soal                            boolean NOT NULL DEFAULT false,
      acak_opsi                            boolean NOT NULL DEFAULT false,
      attempt_maksimal                     integer NOT NULL DEFAULT 1,
      passing_score                        numeric(5,2),
      tampilkan_jawaban_setelah_selesai    boolean NOT NULL DEFAULT false,
      is_aktif                             boolean NOT NULL DEFAULT true,
      total_poin                           numeric(8,2) NOT NULL DEFAULT 0,
      created_at                           timestamptz NOT NULL DEFAULT now(),
      updated_at                           timestamptz NOT NULL DEFAULT now(),
      deleted_at                           timestamptz,
      CONSTRAINT quizzes_attempt_maks_chk CHECK (attempt_maksimal >= 1),
      CONSTRAINT quizzes_passing_score_chk CHECK (passing_score IS NULL OR passing_score BETWEEN 0 AND 100)
    );
    CREATE INDEX quizzes_course_idx ON quizzes (course_id);
    CREATE INDEX quizzes_section_idx ON quizzes (section_id);
    CREATE INDEX quizzes_lesson_idx ON quizzes (lesson_id);
    CREATE INDEX quizzes_is_aktif_idx ON quizzes (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── quiz_questions ──
  pgm.sql(`
    CREATE TABLE quiz_questions (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id           uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_id       uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      urutan            smallint NOT NULL DEFAULT 0,
      poin_override     numeric(6,2),
      created_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (quiz_id, question_id)
    );
    CREATE INDEX quiz_questions_quiz_idx ON quiz_questions (quiz_id);
    CREATE INDEX quiz_questions_question_idx ON quiz_questions (question_id);
    CREATE INDEX quiz_questions_urutan_idx ON quiz_questions (urutan);
  `);

  // ── assignments ──
  pgm.sql(`
    CREATE TABLE assignments (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id               uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      section_id              uuid REFERENCES sections(id) ON DELETE SET NULL,
      lesson_id               uuid REFERENCES lessons(id) ON DELETE SET NULL,
      judul                   varchar(200) NOT NULL,
      instruksi               text NOT NULL,
      tenggat_at              timestamptz,
      tipe_pengumpulan        tipe_pengumpulan NOT NULL DEFAULT 'file',
      maksimal_ukuran_mb      integer,
      poin_maksimal           numeric(6,2) NOT NULL DEFAULT 100,
      is_aktif                boolean NOT NULL DEFAULT true,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT assignments_poin_maks_chk CHECK (poin_maksimal >= 0)
    );
    CREATE INDEX assignments_course_idx ON assignments (course_id);
    CREATE INDEX assignments_section_idx ON assignments (section_id);
    CREATE INDEX assignments_lesson_idx ON assignments (lesson_id);
    CREATE INDEX assignments_tenggat_idx ON assignments (tenggat_at);
    CREATE INDEX assignments_is_aktif_idx ON assignments (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── rubrics ──
  pgm.sql(`
    CREATE TABLE rubrics (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id     uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      kriteria          jsonb NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );
    CREATE UNIQUE INDEX rubrics_assignment_uq ON rubrics (assignment_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON rubrics FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── quiz_attempts & attempt_answers (pasangan induk-anak) ──
  pgm.sql(`
    CREATE TABLE quiz_attempts (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id           uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      quiz_id                 uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      attempt_ke              smallint NOT NULL DEFAULT 1,
      status                  quiz_attempt_status NOT NULL DEFAULT 'belum_dikerjakan',
      skor                    numeric(6,2),
      mulai_at                timestamptz,
      selesai_at              timestamptz,
      waktu_tersisa_detik     integer,
      created_at              timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT quiz_attempts_attempt_ke_chk CHECK (attempt_ke >= 1),
      UNIQUE (enrollment_id, quiz_id, attempt_ke)
    );
    CREATE INDEX quiz_attempts_enrollment_idx ON quiz_attempts (enrollment_id);
    CREATE INDEX quiz_attempts_quiz_idx ON quiz_attempts (quiz_id);
    CREATE INDEX quiz_attempts_status_idx ON quiz_attempts (status);
  `);

  pgm.sql(`
    CREATE TABLE attempt_answers (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_attempt_id     uuid NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id         uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      jawaban             jsonb NOT NULL,
      skor_didapat        numeric(6,2),
      is_benar            boolean,
      dinilai_manual      boolean NOT NULL DEFAULT false,
      created_at          timestamptz NOT NULL DEFAULT now(),
      UNIQUE (quiz_attempt_id, question_id)
    );
    CREATE INDEX attempt_answers_attempt_idx ON attempt_answers (quiz_attempt_id);
    CREATE INDEX attempt_answers_question_idx ON attempt_answers (question_id);
    CREATE INDEX attempt_answers_dinilai_manual_idx ON attempt_answers (dinilai_manual);
  `);

  // ── submissions ──
  pgm.sql(`
    CREATE TABLE submissions (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id       uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      assignment_id       uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      status              submission_status NOT NULL DEFAULT 'belum',
      isi_teks            text,
      file_media_id       uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      url                 text,
      dikumpulkan_at      timestamptz,
      revisi_ke           smallint NOT NULL DEFAULT 0,
      catatan_revisi      text,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      deleted_at          timestamptz,
      UNIQUE (enrollment_id, assignment_id)
    );
    CREATE INDEX submissions_enrollment_idx ON submissions (enrollment_id);
    CREATE INDEX submissions_assignment_idx ON submissions (assignment_id);
    CREATE INDEX submissions_status_idx ON submissions (status);
    CREATE INDEX submissions_file_media_idx ON submissions (file_media_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── grades & gradebook_entries ──
  pgm.sql(`
    CREATE TABLE grades (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id     uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      sumber_tipe       varchar(10) NOT NULL,
      sumber_id         uuid NOT NULL,
      skor              numeric(6,2) NOT NULL,
      skor_maksimal     numeric(6,2) NOT NULL,
      feedback          text,
      dinilai_oleh      uuid REFERENCES users(id) ON DELETE SET NULL,
      dinilai_at        timestamptz,
      rilis_at          timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz,
      CONSTRAINT grades_sumber_tipe_chk CHECK (sumber_tipe IN ('quiz','assignment')),
      CONSTRAINT grades_skor_chk CHECK (skor >= 0),
      CONSTRAINT grades_skor_maksimal_chk CHECK (skor_maksimal > 0)
    );
    CREATE INDEX grades_enrollment_idx ON grades (enrollment_id);
    CREATE INDEX grades_sumber_tipe_idx ON grades (sumber_tipe);
    CREATE INDEX grades_sumber_id_idx ON grades (sumber_id);
    CREATE INDEX grades_dinilai_oleh_idx ON grades (dinilai_oleh);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON grades FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE gradebook_entries (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id         uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      nilai_akhir           numeric(6,2),
      status_kelulusan      varchar(15) NOT NULL DEFAULT 'belum_selesai',
      rincian               jsonb,
      diperbarui_at         timestamptz NOT NULL DEFAULT now(),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT gradebook_entries_status_chk CHECK (status_kelulusan IN ('lulus','tidak_lulus','belum_selesai'))
    );
    CREATE UNIQUE INDEX gradebook_entries_enrollment_uq ON gradebook_entries (enrollment_id);
    CREATE INDEX gradebook_entries_status_idx ON gradebook_entries (status_kelulusan);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON gradebook_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS gradebook_entries;`);
  pgm.sql(`DROP TABLE IF EXISTS grades;`);
  pgm.sql(`DROP TABLE IF EXISTS submissions;`);
  pgm.sql(`DROP TABLE IF EXISTS attempt_answers;`);
  pgm.sql(`DROP TABLE IF EXISTS quiz_attempts;`);
  pgm.sql(`DROP TABLE IF EXISTS rubrics;`);
  pgm.sql(`DROP TABLE IF EXISTS assignments;`);
  pgm.sql(`DROP TABLE IF EXISTS quiz_questions;`);
  pgm.sql(`DROP TABLE IF EXISTS quizzes;`);
  pgm.sql(`DROP TABLE IF EXISTS question_options;`);
  pgm.sql(`DROP TABLE IF EXISTS questions;`);
  pgm.sql(`DROP TABLE IF EXISTS question_banks;`);
  pgm.sql(`DROP TYPE IF EXISTS tipe_pengumpulan;`);
  pgm.sql(`DROP TYPE IF EXISTS submission_status;`);
  pgm.sql(`DROP TYPE IF EXISTS quiz_attempt_status;`);
  pgm.sql(`DROP TYPE IF EXISTS question_tipe;`);
}
