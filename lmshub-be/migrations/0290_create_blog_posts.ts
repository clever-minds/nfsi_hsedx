import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title             varchar(250) NOT NULL,
      slug              citext NOT NULL,
      summary           text,
      content           text NOT NULL,
      cover_image_url   text,
      author_id         uuid REFERENCES users(id) ON DELETE SET NULL,
      author_name       varchar(150),
      category          varchar(100) DEFAULT 'General',
      tags              jsonb DEFAULT '[]'::jsonb,
      status            varchar(20) NOT NULL DEFAULT 'draft',
      published_at      timestamptz,
      view_count        integer NOT NULL DEFAULT 0,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now(),
      deleted_at        timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_uq ON blog_posts (slug) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON blog_posts (status);
    CREATE INDEX IF NOT EXISTS blog_posts_published_at_idx ON blog_posts (published_at);
    CREATE INDEX IF NOT EXISTS blog_posts_created_at_idx ON blog_posts (created_at);
    
    DROP TRIGGER IF EXISTS set_updated_at ON blog_posts;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE IF EXISTS blog_posts CASCADE;
  `);
}
