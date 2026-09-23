/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 00 — Extensions & Base
 * Ekstensi, fungsi trigger set_updated_at, enum global.
 * Konvensi kolom baku (id/created_at/updated_at/deleted_at) dipakai seluruh tabel domain 01–12.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS citext;`);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Enum global (lintas ≥2 domain)
  pgm.sql(`
    DO $$ BEGIN
      CREATE TYPE user_status AS ENUM ('pending','active','inactive');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN
      CREATE TYPE permission_action AS ENUM ('view','create','update','delete');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN
      CREATE TYPE kanal_notifikasi AS ENUM ('in_app','email','wa','push');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TYPE IF EXISTS kanal_notifikasi;`);
  pgm.sql(`DROP TYPE IF EXISTS permission_action;`);
  pgm.sql(`DROP TYPE IF EXISTS user_status;`);
  pgm.sql(`DROP FUNCTION IF EXISTS set_updated_at();`);
  // Extensions sengaja tidak di-drop (dipakai objek lain / aman ditinggalkan).
}
