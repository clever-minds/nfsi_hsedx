/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 02 — Katalog & Kursus
 * categories, tags, media_assets, instructor_profiles, courses, course_tags, course_versions,
 * sections, lessons, lesson_contents, learning_paths, path_courses, prerequisites.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── Enum lokal domain ──
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE course_level AS ENUM ('pemula','menengah','mahir');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE publikasi_status AS ENUM ('draf','dalam_review','terbit','diperbarui','diarsip');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE lesson_tipe AS ENUM ('video','teks','pdf','kuis','tugas','live_class','scorm','embed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE konten_tipe AS ENUM ('video','teks','pdf','embed','scorm');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE media_tipe_file AS ENUM ('video','gambar','dokumen','audio');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE transcode_status AS ENUM ('menunggu','memproses','selesai','gagal');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  // ── categories ──
  pgm.sql(`
    CREATE TABLE categories (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nama        varchar(100) NOT NULL,
      slug        citext NOT NULL,
      deskripsi   text,
      ikon        varchar(100),
      urutan      smallint NOT NULL DEFAULT 0,
      is_aktif    boolean NOT NULL DEFAULT true,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE UNIQUE INDEX categories_slug_uq ON categories (slug) WHERE deleted_at IS NULL;
    CREATE INDEX categories_urutan_idx ON categories (urutan);
    CREATE INDEX categories_aktif_idx ON categories (is_aktif);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── tags ──
  pgm.sql(`
    CREATE TABLE tags (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nama        varchar(60) NOT NULL,
      slug        citext NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE UNIQUE INDEX tags_slug_uq ON tags (slug) WHERE deleted_at IS NULL;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── media_assets (dibuat lebih awal — direferensikan courses/lessons) ──
  pgm.sql(`
    CREATE TABLE media_assets (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      uploader_id           uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      tipe_file             media_tipe_file NOT NULL,
      nama_file             text NOT NULL,
      path_object_storage   text NOT NULL,
      mime_type             varchar(100),
      ukuran_bytes          bigint,
      status_transcode      transcode_status NOT NULL DEFAULT 'menunggu',
      hls_manifest_url      text,
      durasi_detik          integer,
      checksum              text,
      meta                  jsonb,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT media_assets_ukuran_chk CHECK (ukuran_bytes IS NULL OR ukuran_bytes >= 0)
    );
    CREATE INDEX media_assets_uploader_idx ON media_assets (uploader_id);
    CREATE INDEX media_assets_tipe_idx ON media_assets (tipe_file);
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
      status_verifikasi       varchar(20) NOT NULL DEFAULT 'pending',
      sosial_media            jsonb,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at              timestamptz,
      CONSTRAINT instructor_profiles_revenue_share_chk CHECK (revenue_share_percent IS NULL OR revenue_share_percent BETWEEN 0 AND 100),
      CONSTRAINT instructor_profiles_status_chk CHECK (status_verifikasi IN ('pending','terverifikasi','ditolak'))
    );
    CREATE UNIQUE INDEX instructor_profiles_user_uq ON instructor_profiles (user_id);
    CREATE INDEX instructor_profiles_status_idx ON instructor_profiles (status_verifikasi);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON instructor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── courses (tanpa current_version_id — ditambah via ALTER setelah course_versions ada) ──
  pgm.sql(`
    CREATE TABLE courses (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      judul                   varchar(200) NOT NULL,
      slug                    citext NOT NULL,
      ringkasan               varchar(500),
      deskripsi               text,
      category_id             uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      instructor_id           uuid NOT NULL REFERENCES instructor_profiles(id) ON DELETE RESTRICT,
      level                   course_level NOT NULL DEFAULT 'pemula',
      harga                   numeric(18,2) NOT NULL DEFAULT 0,
      harga_coret             numeric(18,2),
      status_publikasi        publikasi_status NOT NULL DEFAULT 'draf',
      thumbnail_media_id      uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      promo_video_media_id    uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      bahasa                  varchar(10) NOT NULL DEFAULT 'id',
      durasi_total_menit      integer NOT NULL DEFAULT 0,
      rating_avg              numeric(3,2) NOT NULL DEFAULT 0,
      rating_count            integer NOT NULL DEFAULT 0,
      jumlah_siswa            integer NOT NULL DEFAULT 0,
      published_at            timestamptz,
      meta                    jsonb,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now(),
      deleted_at               timestamptz,
      CONSTRAINT courses_harga_chk CHECK (harga >= 0),
      CONSTRAINT courses_harga_coret_chk CHECK (harga_coret IS NULL OR harga_coret >= 0)
    );
    CREATE UNIQUE INDEX courses_slug_uq ON courses (slug) WHERE deleted_at IS NULL;
    CREATE INDEX courses_judul_idx ON courses (judul);
    CREATE INDEX courses_category_idx ON courses (category_id);
    CREATE INDEX courses_instructor_idx ON courses (instructor_id);
    CREATE INDEX courses_level_idx ON courses (level);
    CREATE INDEX courses_status_publikasi_idx ON courses (status_publikasi);
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
      nomor_versi         integer NOT NULL,
      status              varchar(10) NOT NULL DEFAULT 'draft',
      snapshot            jsonb NOT NULL,
      catatan_perubahan   text,
      published_at        timestamptz,
      created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at          timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT course_versions_status_chk CHECK (status IN ('draft','terbit')),
      UNIQUE (course_id, nomor_versi)
    );
    CREATE INDEX course_versions_course_idx ON course_versions (course_id);
    CREATE INDEX course_versions_nomor_idx ON course_versions (nomor_versi);
    CREATE INDEX course_versions_status_idx ON course_versions (status);
    CREATE INDEX course_versions_created_by_idx ON course_versions (created_by);
  `);

  // FK melingkar: tambahkan current_version_id setelah course_versions terbentuk
  pgm.sql(`
    ALTER TABLE courses ADD COLUMN current_version_id uuid REFERENCES course_versions(id) ON DELETE SET NULL;
    CREATE INDEX courses_current_version_idx ON courses (current_version_id);
  `);

  // ── sections & lessons ──
  pgm.sql(`
    CREATE TABLE sections (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      judul       varchar(200) NOT NULL,
      urutan      smallint NOT NULL DEFAULT 0,
      deskripsi   text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE INDEX sections_course_idx ON sections (course_id);
    CREATE INDEX sections_urutan_idx ON sections (urutan);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE lessons (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      section_id         uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      judul              varchar(200) NOT NULL,
      tipe               lesson_tipe NOT NULL DEFAULT 'video',
      urutan             smallint NOT NULL DEFAULT 0,
      durasi_menit       integer,
      gratis_preview     boolean NOT NULL DEFAULT false,
      drip_release_at    timestamptz,
      wajib_selesai      boolean NOT NULL DEFAULT true,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now(),
      deleted_at         timestamptz
    );
    CREATE INDEX lessons_section_idx ON lessons (section_id);
    CREATE INDEX lessons_tipe_idx ON lessons (tipe);
    CREATE INDEX lessons_urutan_idx ON lessons (urutan);
    CREATE INDEX lessons_gratis_preview_idx ON lessons (gratis_preview);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── lesson_contents ──
  pgm.sql(`
    CREATE TABLE lesson_contents (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lesson_id             uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      tipe                  konten_tipe NOT NULL,
      urutan                smallint NOT NULL DEFAULT 0,
      body                  text,
      media_asset_id        uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      url                   text,
      scorm_manifest_url    text,
      durasi_detik          integer,
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz
    );
    CREATE INDEX lesson_contents_lesson_idx ON lesson_contents (lesson_id);
    CREATE INDEX lesson_contents_tipe_idx ON lesson_contents (tipe);
    CREATE INDEX lesson_contents_media_asset_idx ON lesson_contents (media_asset_id);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON lesson_contents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── learning_paths & path_courses ──
  pgm.sql(`
    CREATE TABLE learning_paths (
      id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nama                  varchar(200) NOT NULL,
      slug                  citext NOT NULL,
      deskripsi             text,
      jenjang               varchar(50),
      thumbnail_media_id    uuid REFERENCES media_assets(id) ON DELETE SET NULL,
      status_publikasi      publikasi_status NOT NULL DEFAULT 'draf',
      harga_bundle          numeric(18,2),
      created_at            timestamptz NOT NULL DEFAULT now(),
      updated_at            timestamptz NOT NULL DEFAULT now(),
      deleted_at            timestamptz,
      CONSTRAINT learning_paths_harga_bundle_chk CHECK (harga_bundle IS NULL OR harga_bundle >= 0)
    );
    CREATE UNIQUE INDEX learning_paths_slug_uq ON learning_paths (slug) WHERE deleted_at IS NULL;
    CREATE INDEX learning_paths_thumbnail_idx ON learning_paths (thumbnail_media_id);
    CREATE INDEX learning_paths_status_idx ON learning_paths (status_publikasi);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON learning_paths FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE path_courses (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      path_id     uuid NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
      course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      urutan      smallint NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (path_id, course_id)
    );
    CREATE INDEX path_courses_path_idx ON path_courses (path_id);
    CREATE INDEX path_courses_course_idx ON path_courses (course_id);
    CREATE INDEX path_courses_urutan_idx ON path_courses (urutan);
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
  pgm.sql(`DROP TYPE IF EXISTS media_tipe_file;`);
  pgm.sql(`DROP TYPE IF EXISTS konten_tipe;`);
  pgm.sql(`DROP TYPE IF EXISTS lesson_tipe;`);
  pgm.sql(`DROP TYPE IF EXISTS publikasi_status;`);
  pgm.sql(`DROP TYPE IF EXISTS course_level;`);
}
