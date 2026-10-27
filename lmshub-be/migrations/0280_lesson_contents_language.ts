import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE lesson_contents
    ADD COLUMN IF NOT EXISTS language varchar(10) NOT NULL DEFAULT 'all';

    CREATE INDEX IF NOT EXISTS lesson_contents_language_idx ON lesson_contents (language);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS lesson_contents_language_idx;
    ALTER TABLE lesson_contents DROP COLUMN IF EXISTS language;
  `);
}
