/* eslint-disable @typescript-eslint/naming-convention */
import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Domain 01 — Auth & RBAC
 * roles, permissions, role_permissions, users, user_roles, user_permissions, sessions, auth_tokens.
 */
export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // enum lokal domain
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE session_status AS ENUM ('aktif','revoked','expired');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  pgm.sql(`
    DO $$ BEGIN CREATE TYPE auth_token_jenis AS ENUM ('otp_login','verifikasi_email','verifikasi_wa','reset_password','sso');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  pgm.sql(`
    CREATE TABLE roles (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kode        citext NOT NULL,
      nama        varchar(100) NOT NULL,
      level       smallint NOT NULL DEFAULT 0,
      deskripsi   text,
      is_system   boolean NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE UNIQUE INDEX roles_kode_uq ON roles (kode) WHERE deleted_at IS NULL;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE permissions (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      module      varchar(60) NOT NULL,
      action      permission_action NOT NULL,
      deskripsi   text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE UNIQUE INDEX permissions_module_action_uq ON permissions (module, action) WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    CREATE TABLE role_permissions (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      created_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (role_id, permission_id)
    );
    CREATE INDEX role_permissions_role_idx ON role_permissions (role_id);
    CREATE INDEX role_permissions_perm_idx ON role_permissions (permission_id);
  `);

  pgm.sql(`
    CREATE TABLE users (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nama_lengkap    varchar(150) NOT NULL,
      email           citext,
      nomor_wa        varchar(20),
      password_hash   text,
      role_id         uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      status          user_status NOT NULL DEFAULT 'pending',
      is_multi_peran  boolean NOT NULL DEFAULT false,
      email_verified_at timestamptz,
      wa_verified_at    timestamptz,
      created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
      last_login_at   timestamptz,
      meta            jsonb,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz,
      CONSTRAINT users_kontak_chk CHECK (email IS NOT NULL OR nomor_wa IS NOT NULL)
    );
    CREATE UNIQUE INDEX users_email_uq ON users (email) WHERE deleted_at IS NULL AND email IS NOT NULL;
    CREATE UNIQUE INDEX users_wa_uq ON users (nomor_wa) WHERE deleted_at IS NULL AND nomor_wa IS NOT NULL;
    CREATE INDEX users_role_status_idx ON users (role_id, status);
    CREATE INDEX users_created_by_idx ON users (created_by);
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE user_roles (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      is_primary  boolean NOT NULL DEFAULT false,
      assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
      alasan      text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, role_id)
    );
    CREATE INDEX user_roles_user_idx ON user_roles (user_id);
  `);

  pgm.sql(`
    CREATE TABLE user_permissions (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      effect        varchar(10) NOT NULL DEFAULT 'allow',
      granted_by    uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, permission_id),
      CONSTRAINT user_permissions_effect_chk CHECK (effect IN ('allow','deny'))
    );
    CREATE INDEX user_permissions_user_idx ON user_permissions (user_id);
  `);

  pgm.sql(`
    CREATE TABLE sessions (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash text NOT NULL,
      status             session_status NOT NULL DEFAULT 'aktif',
      user_agent         text,
      ip_address         inet,
      device_label       varchar(100),
      expires_at         timestamptz NOT NULL,
      revoked_at         timestamptz,
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX sessions_token_uq ON sessions (refresh_token_hash);
    CREATE INDEX sessions_user_idx ON sessions (user_id);
    CREATE INDEX sessions_expires_idx ON sessions (expires_at);
  `);

  pgm.sql(`
    CREATE TABLE auth_tokens (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
      jenis       auth_token_jenis NOT NULL,
      token_hash  text NOT NULL,
      channel     kanal_notifikasi,
      target      citext,
      expires_at  timestamptz NOT NULL,
      consumed_at timestamptz,
      attempts    smallint NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id);
    CREATE INDEX auth_tokens_lookup_idx ON auth_tokens (jenis, target);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS auth_tokens;`);
  pgm.sql(`DROP TABLE IF EXISTS sessions;`);
  pgm.sql(`DROP TABLE IF EXISTS user_permissions;`);
  pgm.sql(`DROP TABLE IF EXISTS user_roles;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
  pgm.sql(`DROP TABLE IF EXISTS role_permissions;`);
  pgm.sql(`DROP TABLE IF EXISTS permissions;`);
  pgm.sql(`DROP TABLE IF EXISTS roles;`);
  pgm.sql(`DROP TYPE IF EXISTS auth_token_jenis;`);
  pgm.sql(`DROP TYPE IF EXISTS session_status;`);
}
