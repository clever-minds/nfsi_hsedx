/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 02 — Catalog & Course
 * categories, tags, media_assets, instructor_profiles, courses, course_tags, course_versions,
 * sections, lessons, lesson_contents, learning_paths, path_courses, prerequisites.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE course_level AS ENUM ('beginner','intermediate','advanced');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE publication_status AS ENUM ('draft','in_review','publish','updated','archived');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE lesson_type AS ENUM ('video','text','pdf','quiz','assignment','live_class','scorm','embed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE content_type AS ENUM ('video','text','pdf','embed','scorm');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE media_file_type AS ENUM ('video','image','document','audio');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE transcode_status AS ENUM ('pending','memproses','completed','failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── categories ──
  pgm.sql(`
    CREATE TABLE categories (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        varchar(100) NOT NULL,
      slug        citext NOT NULL,
      description   text,
      ikon        varchar(100),
      sort_order      smallint NOT NULL DEFAULT 0,
      is_active    boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE UNIQUE INDEX categories_slug_uq ON categories (slug) WHERE deleted_at IS NULL;
    CREATE INDEX categories_sort_orderan_idx ON categories (sort_order);
    CREATE INDEX categories_aktif_idx ON categories (is_active);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── tags ──
  pgm.sql(`
    CREATE TABLE tags (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name        varchar(60) NOT NULL,
      slug        citext NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE UNIQUE INDEX tags_slug_uq ON tags (slug) WHERE deleted_at IS NULL;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── media_assets (created lebih awal — direferensikan courses/lessons) ──
  pgm.sql(`
    CREATE TABLE media_assets (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      uploader_id           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      file_type             media_file_type NOT NULL,
      file_name             text NOT NULL,
      path_object_storage   text NOT NULL,
      mime_type             varchar(100),
      size_bytes          bigint,
      status_transcode      transcode_status NOT NULL DEFAULT 'pending',
      hls_manifest_url      text,
      duration_seconds          integer,
      checksum              text,
      meta                  jsonb,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT media_assets_ukuran_chk CHECK (size_bytes IS NULL OR size_bytes >= 0)
    );
    CREATE INDEX media_assets_uploader_idx ON media_assets (uploader_id);
    CREATE INDEX media_assets_type_idx ON media_assets (file_type);
    CREATE INDEX media_assets_transcode_idx ON media_assets (status_transcode);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── instructor_profiles ──
  pgm.sql(`
    CREATE TABLE instructor_profiles (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bio                     text,
      keahlian                jsonb,
      revenue_share_percent   numeric(5,2),
      rating_avg              numeric(3,2) NOT NULL DEFAULT 0,
      rating_count            integer NOT NULL DEFAULT 0,
      total_siswa             integer NOT NULL DEFAULT 0,
      verification_status       varchar(20) NOT NULL DEFAULT 'pending',
      sosial_media            jsonb,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT instructor_profiles_revenue_share_chk CHECK (revenue_share_percent IS NULL OR revenue_share_percent BETWEEN 0 AND 100),
      CONSTRAINT instructor_profiles_status_chk CHECK (verification_status IN ('pending','verified','rejected'))
    );
    CREATE UNIQUE INDEX instructor_profiles_user_uq ON instructor_profiles (user_id);
    CREATE INDEX instructor_profiles_status_idx ON instructor_profiles (verification_status);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON instructor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── courses (tanpa current_version_id — ditambah via ALTER setelah course_versions ada) ──
  pgm.sql(`
    CREATE TABLE courses (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title                   varchar(200) NOT NULL,
      slug                    citext NOT NULL,
      summary               varchar(500),
      description               text,
      category_id             uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      instructor_id           uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE RESTRICT,
      level                   course_level NOT NULL DEFAULT 'beginner',
      price                   numeric(18,2) NOT NULL DEFAULT 0,
      strike_price             numeric(18,2),
      publication_status        publication_status NOT NULL DEFAULT 'draft',
      thumbnail_media_id      uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      promo_video_media_id    uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      language                  varchar(10) NOT NULL DEFAULT 'id',
      total_duration_minutes      integer NOT NULL DEFAULT 0,
      rating_avg              numeric(3,2) NOT NULL DEFAULT 0,
      rating_count            integer NOT NULL DEFAULT 0,
      student_count            integer NOT NULL DEFAULT 0,
      published_at            timestamptz,
      meta                    jsonb,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at               timestamptz,
      CONSTRAINT courses_price_chk CHECK (price >= 0),
      CONSTRAINT courses_price_coret_chk CHECK (strike_price IS NULL OR strike_price >= 0)
    );
    CREATE UNIQUE INDEX courses_slug_uq ON courses (slug) WHERE deleted_at IS NULL;
    CREATE INDEX courses_title_idx ON courses (title);
    CREATE INDEX courses_category_idx ON courses (category_id);
    CREATE INDEX courses_instructor_idx ON courses (instructor_id);
    CREATE INDEX courses_level_idx ON courses (level);
    CREATE INDEX courses_status_publikasi_idx ON courses (publication_status);
    CREATE INDEX courses_thumbnail_idx ON courses (thumbnail_media_id);
    CREATE INDEX courses_promo_video_idx ON courses (promo_video_media_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── course_tags & course_versions (digabung — keduanya hanya bergantung pada courses) ──
  pgm.sql(`
    CREATE TABLE course_tags (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      tag_id      uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (course_id, tag_id)
    );
    CREATE INDEX course_tags_course_idx ON course_tags (course_id);
    CREATE INDEX course_tags_tag_idx ON course_tags (tag_id);
  `);

  pgm.sql(`
    CREATE TABLE course_versions (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      number_versi         integer NOT NULL,
      status              varchar(10) NOT NULL DEFAULT 'draft',
      snapshot            jsonb NOT NULL,
      notes_perubahan   text,
      published_at        timestamptz,
      created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT course_versions_status_chk CHECK (status IN ('draft','publish')),
      UNIQUE (course_id, number_versi)
    );
    CREATE INDEX course_versions_course_idx ON course_versions (course_id);
    CREATE INDEX course_versions_number_idx ON course_versions (number_versi);
    CREATE INDEX course_versions_status_idx ON course_versions (status);
    CREATE INDEX course_versions_created_by_idx ON course_versions (created_by);
  `);

  // FK melingkar: add current_version_id setelah course_versions terbentuk
  pgm.sql(`
    ALTER TABLE courses ADD COLUMN current_version_id uuid REFERENCES course_versions(id) ON DELETE SET NULL;
    CREATE INDEX courses_current_version_idx ON courses (current_version_id);
  `);

  // ── sections & lessons ──
  pgm.sql(`
    CREATE TABLE sections (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title       varchar(200) NOT NULL,
      sort_order      smallint NOT NULL DEFAULT 0,
      description   text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE INDEX sections_course_idx ON sections (course_id);
    CREATE INDEX sections_sort_orderan_idx ON sections (sort_order);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE lessons (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id         uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      title              varchar(200) NOT NULL,
      type               lesson_type NOT NULL DEFAULT 'video',
      sort_order             smallint NOT NULL DEFAULT 0,
      duration_minutes       integer,
      gratis_preview     boolean NOT NULL DEFAULT false,
      drip_release_at    timestamptz,
      must_complete      boolean NOT NULL DEFAULT true,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      deleted_at         timestamptz
    );
    CREATE INDEX lessons_section_idx ON lessons (section_id);
    CREATE INDEX lessons_type_idx ON lessons (type);
    CREATE INDEX lessons_sort_orderan_idx ON lessons (sort_order);
    CREATE INDEX lessons_gratis_preview_idx ON lessons (gratis_preview);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── lesson_contents ──
  pgm.sql(`
    CREATE TABLE lesson_contents (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lesson_id             uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      type                  content_type NOT NULL,
      sort_order                smallint NOT NULL DEFAULT 0,
      body                  text,
      media_asset_id        uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      url                   text,
      scorm_manifest_url    text,
      duration_seconds          integer,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz
    );
    CREATE INDEX lesson_contents_lesson_idx ON lesson_contents (lesson_id);
    CREATE INDEX lesson_contents_type_idx ON lesson_contents (type);
    CREATE INDEX lesson_contents_media_asset_idx ON lesson_contents (media_asset_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON lesson_contents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── learning_paths & path_courses ──
  pgm.sql(`
    CREATE TABLE learning_paths (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name                  varchar(200) NOT NULL,
      slug                  citext NOT NULL,
      description             text,
      jenjang               varchar(50),
      thumbnail_media_id    uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      publication_status      publication_status NOT NULL DEFAULT 'draft',
      price_bundle          numeric(18,2),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT learning_paths_price_bundle_chk CHECK (price_bundle IS NULL OR price_bundle >= 0)
    );
    CREATE UNIQUE INDEX learning_paths_slug_uq ON learning_paths (slug) WHERE deleted_at IS NULL;
    CREATE INDEX learning_paths_thumbnail_idx ON learning_paths (thumbnail_media_id);
    CREATE INDEX learning_paths_status_idx ON learning_paths (publication_status);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON learning_paths FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE path_courses (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      path_id     uuid NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
      course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      sort_order      smallint NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (path_id, course_id)
    );
    CREATE INDEX path_courses_path_idx ON path_courses (path_id);
    CREATE INDEX path_courses_course_idx ON path_courses (course_id);
    CREATE INDEX path_courses_sort_orderan_idx ON path_courses (sort_order);
  `);

  // ── prerequisites (self-relasi N-N pada courses) ──
  pgm.sql(`
    CREATE TABLE prerequisites (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id             uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      required_course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      created_at            timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT prerequisites_no_self_chk CHECK (course_id <> required_course_id),
      UNIQUE (course_id, required_course_id)
    );
    CREATE INDEX prerequisites_course_idx ON prerequisites (course_id);
    CREATE INDEX prerequisites_required_idx ON prerequisites (required_course_id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS prerequisites;`);
  pgm.sql(`DROP TABLE IF EXISTS path_courses;`);
  pgm.sql(`DROP TABLE IF EXISTS learning_paths;`);
  pgm.sql(`DROP TABLE IF EXISTS lesson_contents;`);
  pgm.sql(`DROP TABLE IF EXISTS lessons;`);
  pgm.sql(`DROP TABLE IF EXISTS sections;`);
  pgm.sql(`ALTER TABLE courses DROP COLUMN IF EXISTS current_version_id;`);
  pgm.sql(`DROP TABLE IF EXISTS course_versions;`);
  pgm.sql(`DROP TABLE IF EXISTS course_tags;`);
  pgm.sql(`DROP TABLE IF EXISTS courses;`);
  pgm.sql(`DROP TABLE IF EXISTS instructor_profiles;`);
  pgm.sql(`DROP TABLE IF EXISTS media_assets;`);
  pgm.sql(`DROP TABLE IF EXISTS tags;`);
  pgm.sql(`DROP TABLE IF EXISTS categories;`);
  pgm.sql(`DROP TYPE IF EXISTS transcode_status;`);
  pgm.sql(`DROP TYPE IF EXISTS media_file_type;`);
  pgm.sql(`DROP TYPE IF EXISTS content_type;`);
  pgm.sql(`DROP TYPE IF EXISTS lesson_type;`);
  pgm.sql(`DROP TYPE IF EXISTS publication_status;`);
  pgm.sql(`DROP TYPE IF EXISTS course_level;`);
}
