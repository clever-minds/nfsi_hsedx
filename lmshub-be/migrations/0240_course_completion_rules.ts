import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Aturan kelulusan per course: exam akhir, batas percobaan, jeda ulang, dan
 * izin mengulang course.
 *
 * Aditif — no ada kolom yang dihapus atau diganti name:
 * - `courses.final_exam_quiz_id`  quiz yang menjadi exam akhir (NULL = tanpa
 *   exam; certificate diberikan seperti previous, cukup progres).
 * - `courses.allow_restart`      student boleh mengulang course from nol.
 * - `quizzes.retry_delay_minutes`     jeda minimum antar-percobaan (0 = tanpa jeda).
 *
 * Satu-satunya perubahan pada objek lama adalah melonggarkan CHECK
 * `max_attempts >= 1` menjadi `>= 0`, karena 0 kini berarti "tanpa batas".
 * Semua value yang ada tetap sah dan artinya no berubah.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE courses
      ADD COLUMN IF NOT EXISTS final_exam_quiz_id uuid REFERENCES quizzes(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS allow_restart boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS courses_final_exam_idx ON courses (final_exam_quiz_id);
  `);

  pgm.sql(`
    ALTER TABLE quizzes
      ADD COLUMN IF NOT EXISTS retry_delay_minutes integer NOT NULL DEFAULT 0;
    ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_jeda_ulang_chk;
    ALTER TABLE quizzes ADD CONSTRAINT quizzes_jeda_ulang_chk CHECK (retry_delay_minutes >= 0);

    ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_attempt_maks_chk;
    ALTER TABLE quizzes ADD CONSTRAINT quizzes_attempt_maks_chk CHECK (max_attempts >= 0);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // "Tanpa batas" (0) no bisa dinyatakan by CHECK lama. grade terbesar yang
  // muat di `quiz_attempts.attempt_number` (smallint) dipakai agar quiz itu tetap
  // praktis tanpa batas setelah rollback, bukan mendadak hanya 1 percobaan.
  pgm.sql(`
    UPDATE quizzes SET max_attempts = 32767 WHERE max_attempts = 0;
    ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_attempt_maks_chk;
    ALTER TABLE quizzes ADD CONSTRAINT quizzes_attempt_maks_chk CHECK (max_attempts >= 1);
    ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS quizzes_jeda_ulang_chk;
    ALTER TABLE quizzes DROP COLUMN IF EXISTS retry_delay_minutes;
  `);
  pgm.sql(`
    DROP INDEX IF EXISTS courses_final_exam_idx;
    ALTER TABLE courses DROP COLUMN IF EXISTS allow_restart, DROP COLUMN IF EXISTS final_exam_quiz_id;
  `);
}
