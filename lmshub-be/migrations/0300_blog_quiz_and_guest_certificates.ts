import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- 1. Add quiz_data to blog_posts for interactive assessments
    ALTER TABLE blog_posts
      ADD COLUMN IF NOT EXISTS quiz_data jsonb DEFAULT NULL;

    -- 2. Add blog_id and guest recipient columns to certificates table
    ALTER TABLE certificates
      ADD COLUMN IF NOT EXISTS blog_id uuid REFERENCES blog_posts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS recipient_name varchar(150),
      ADD COLUMN IF NOT EXISTS recipient_email varchar(150);

    -- 3. Make user_id, course_id, and enrollment_id nullable to support guest certificate issuance
    ALTER TABLE certificates
      ALTER COLUMN user_id DROP NOT NULL,
      ALTER COLUMN course_id DROP NOT NULL,
      ALTER COLUMN enrollment_id DROP NOT NULL;

    -- 4. Fast lookup indexes
    CREATE INDEX IF NOT EXISTS certificates_blog_id_idx ON certificates (blog_id);
    CREATE INDEX IF NOT EXISTS certificates_recipient_email_idx ON certificates (recipient_email);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS certificates_recipient_email_idx;
    DROP INDEX IF EXISTS certificates_blog_id_idx;

    ALTER TABLE certificates
      DROP COLUMN IF EXISTS recipient_email,
      DROP COLUMN IF EXISTS recipient_name,
      DROP COLUMN IF EXISTS blog_id;

    ALTER TABLE blog_posts
      DROP COLUMN IF EXISTS quiz_data;
  `);
}
