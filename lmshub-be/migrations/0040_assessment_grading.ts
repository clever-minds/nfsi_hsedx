/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 04 — Assessment & Grading
 * question_banks, questions, question_options, quizzes, quiz_questions, assignments, rubrics,
 * quiz_attempts, attempt_answers, submissions, grades, gradebook_entries.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE question_type AS ENUM
      ('single_choice','multiple_choice','true_false','short_answer','essay','file_upload','matching');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE quiz_attempt_status AS ENUM ('not_started','in_progress','submitted','graded');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE submission_status AS ENUM ('not_started','submitted','graded','revision_requested');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE submission_type AS ENUM ('file','text','url','mixed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── question_banks ──
  pgm.sql(`
    CREATE TABLE question_banks (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name          varchar(150) NOT NULL,
      course_id     uuid REFERENCES courses(id) ON DELETE CASCADE,
      category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
      description     text,
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
      type                  question_type NOT NULL,
      question_text             text NOT NULL,
      points                  numeric(6,2) NOT NULL DEFAULT 1,
      answer_explanation    text,
      meta                  jsonb,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT questions_points_chk CHECK (points >= 0)
    );
    CREATE INDEX questions_bank_idx ON questions (question_bank_id);
    CREATE INDEX questions_type_idx ON questions (type);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE question_options (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id       uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_text         text NOT NULL,
      is_correct          boolean NOT NULL DEFAULT false,
      pair_key      varchar(50),
      sort_order            smallint NOT NULL DEFAULT 0,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );
    CREATE INDEX question_options_question_idx ON question_options (question_id);
    CREATE INDEX question_options_is_correct_idx ON question_options (is_correct);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON question_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── quizzes ──
  pgm.sql(`
    CREATE TABLE quizzes (
      id                                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id                            uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      section_id                           uuid REFERENCES sections(id) ON DELETE SET NULL,
      lesson_id                            uuid REFERENCES lessons(id) ON DELETE SET NULL,
      title                                varchar(200) NOT NULL,
      description                            text,
      time_limit_minutes                    integer,
      randomize_questions                            boolean NOT NULL DEFAULT false,
      randomize_options                            boolean NOT NULL DEFAULT false,
      max_attempts                     integer NOT NULL DEFAULT 1,
      passing_score                        numeric(5,2),
      show_answers_after_completion    boolean NOT NULL DEFAULT false,
      is_active                             boolean NOT NULL DEFAULT true,
      total_pointsts                           numeric(8,2) NOT NULL DEFAULT 0,
      created_at                           timestamptz NOT NULL DEFAULT now(),
      updated_at                           timestamptz NOT NULL DEFAULT now(),
      deleted_at                           timestamptz,
      CONSTRAINT quizzes_attempt_maks_chk CHECK (max_attempts >= 1),
      CONSTRAINT quizzes_passing_score_chk CHECK (passing_score IS NULL OR passing_score BETWEEN 0 AND 100)
    );
    CREATE INDEX quizzes_course_idx ON quizzes (course_id);
    CREATE INDEX quizzes_section_idx ON quizzes (section_id);
    CREATE INDEX quizzes_lesson_idx ON quizzes (lesson_id);
    CREATE INDEX quizzes_is_aktif_idx ON quizzes (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── quiz_questions ──
  pgm.sql(`
    CREATE TABLE quiz_questions (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      quiz_id           uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_id       uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      sort_order            smallint NOT NULL DEFAULT 0,
      points_override     numeric(6,2),
      created_at        timestamptz NOT NULL DEFAULT now(),
      UNIQUE (quiz_id, question_id)
    );
    CREATE INDEX quiz_questions_quiz_idx ON quiz_questions (quiz_id);
    CREATE INDEX quiz_questions_question_idx ON quiz_questions (question_id);
    CREATE INDEX quiz_questions_sort_orderan_idx ON quiz_questions (sort_order);
  `);

  // ── assignments ──
  pgm.sql(`
    CREATE TABLE assignments (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id               uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      section_id              uuid REFERENCES sections(id) ON DELETE SET NULL,
      lesson_id               uuid REFERENCES lessons(id) ON DELETE SET NULL,
      title                   varchar(200) NOT NULL,
      instructions               text NOT NULL,
      due_at              timestamptz,
      submission_type        submission_type NOT NULL DEFAULT 'file',
      max_size_mb      integer,
      points_maximum           numeric(6,2) NOT NULL DEFAULT 100,
      is_active                boolean NOT NULL DEFAULT true,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT assignments_points_maks_chk CHECK (points_maximum >= 0)
    );
    CREATE INDEX assignments_course_idx ON assignments (course_id);
    CREATE INDEX assignments_section_idx ON assignments (section_id);
    CREATE INDEX assignments_lesson_idx ON assignments (lesson_id);
    CREATE INDEX assignments_tenggat_idx ON assignments (due_at);
    CREATE INDEX assignments_is_aktif_idx ON assignments (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── rubrics ──
  pgm.sql(`
    CREATE TABLE rubrics (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      assignment_id     uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      criteria          jsonb NOT NULL,
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
      attempt_number              smallint NOT NULL DEFAULT 1,
      status                  quiz_attempt_status NOT NULL DEFAULT 'not_started',
      score                    numeric(6,2),
      started_at                timestamptz,
      finished_at              timestamptz,
      remaining_time_seconds     integer,
      created_at              timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT quiz_attempts_attempt_number_chk CHECK (attempt_number >= 1),
      UNIQUE (enrollment_id, quiz_id, attempt_number)
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
      answer             jsonb NOT NULL,
      earned_score        numeric(6,2),
      is_correct            boolean,
      manually_graded      boolean NOT NULL DEFAULT false,
      created_at          timestamptz NOT NULL DEFAULT now(),
      UNIQUE (quiz_attempt_id, question_id)
    );
    CREATE INDEX attempt_answers_attempt_idx ON attempt_answers (quiz_attempt_id);
    CREATE INDEX attempt_answers_question_idx ON attempt_answers (question_id);
    CREATE INDEX attempt_answers_manually_graded_idx ON attempt_answers (manually_graded);
  `);

  // ── submissions ──
  pgm.sql(`
    CREATE TABLE submissions (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id       uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      assignment_id       uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      status              submission_status NOT NULL DEFAULT 'not_started',
      text_content            text,
      file_media_id       uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      url                 text,
      submitted_at      timestamptz,
      revision_number           smallint NOT NULL DEFAULT 0,
      revision_notes      text,
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
      source_type       varchar(10) NOT NULL,
      source_id         uuid NOT NULL,
      score              numeric(6,2) NOT NULL,
      score_maximum     numeric(6,2) NOT NULL,
      feedback          text,
      graded_by      uuid REFERENCES users(id) ON DELETE SET NULL,
      graded_at        timestamptz,
      released_at          timestamptz,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz,
      CONSTRAINT grades_source_type_chk CHECK (source_type IN ('quiz','assignment')),
      CONSTRAINT grades_score_chk CHECK (score >= 0),
      CONSTRAINT grades_score_maximum_chk CHECK (score_maximum > 0)
    );
    CREATE INDEX grades_enrollment_idx ON grades (enrollment_id);
    CREATE INDEX grades_source_type_idx ON grades (source_type);
    CREATE INDEX grades_source_id_idx ON grades (source_id);
    CREATE INDEX grades_graded_by_idx ON grades (graded_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON grades FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE gradebook_entries (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      enrollment_id         uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      final_grade           numeric(6,2),
      graduation_status      varchar(15) NOT NULL DEFAULT 'incomplete',
      details               jsonb,
      updated_at_custom         timestamptz NOT NULL DEFAULT now(),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT gradebook_entries_status_chk CHECK (graduation_status IN ('passed','failed','incomplete'))
    );
    CREATE UNIQUE INDEX gradebook_entries_enrollment_uq ON gradebook_entries (enrollment_id);
    CREATE INDEX gradebook_entries_status_idx ON gradebook_entries (graduation_status);
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
  pgm.sql(`DROP TYPE IF EXISTS submission_type;`);
  pgm.sql(`DROP TYPE IF EXISTS submission_status;`);
  pgm.sql(`DROP TYPE IF EXISTS quiz_attempt_status;`);
  pgm.sql(`DROP TYPE IF EXISTS question_type;`);
}
