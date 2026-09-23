import { readFile, writeFile, access, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';

import { Pool } from 'pg';
import { hashPassword } from '../../core/auth/password';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/http/AppError';

const run = promisify(execFile);

/**
 * First-run installer.
 *
 * Buyers of a PHP script expect to upload files, open a URL, and fill in a form.
 * A Node app normally asks them to open a terminal, edit a dotfile they were
 * told to keep secret, and know which of forty variables matter. This closes
 * that gap.
 *
 * Two rules shape everything here:
 *
 *  - The installer never touches the running application's connection pool. It
 *    opens its own short-lived pool from the credentials being tested, so a
 *    wrong password fails a form field instead of taking the process down.
 *  - Every endpoint refuses once the system is installed. An installer that
 *    stays reachable is a way to hand the site to whoever finds it.
 */

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');

/** Cached only once true — an installed system never becomes uninstalled. */
let installedCache = false;

export interface Requirement {
  name: string;
  ok: boolean;
  detail: string;
}

/** Node version, write access, and whether a database is already reachable. */
export async function requirements(): Promise<Requirement[]> {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const out: Requirement[] = [
    {
      name: 'Node.js 20 or newer',
      ok: nodeMajor >= 20,
      detail: `found ${process.versions.node}`,
    },
  ];

  // The installer has to write .env; without this the whole flow is pointless.
  let writable = true;
  let writeDetail = ROOT;
  try {
    await access(ROOT, constants.W_OK);
  } catch {
    writable = false;
    writeDetail = `${ROOT} is not writable by the service account`;
  }
  out.push({ name: 'Application directory is writable', ok: writable, detail: writeDetail });

  return out;
}

export async function isInstalled(): Promise<boolean> {
  if (installedCache) return true;

  const url = process.env.DATABASE_URL;
  if (!url) return false;

  const probe = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 4000 });
  try {
    // Installed means: the schema exists AND somebody can sign in as an admin.
    // Either alone is a half-finished install that should resume, not lock out.
    const res = await probe.query(
      `SELECT count(*)::int AS n
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.kode = 'super_admin' AND u.deleted_at IS NULL`,
    );
    installedCache = (res.rows[0]?.n ?? 0) > 0;
    return installedCache;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

/** Refuse anything that would let a stranger reconfigure a live site. */
export async function assertNotInstalled(): Promise<void> {
  if (await isInstalled()) {
    throw AppError.forbidden(
      'This system is already installed. Remove the admin account from the database if you genuinely need to run the installer again.',
      'install.already_installed',
    );
  }
}

export interface DatabaseInput {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export function connectionString(input: DatabaseInput): string {
  const auth = `${encodeURIComponent(input.user)}:${encodeURIComponent(input.password)}`;
  const sslmode = input.ssl ? 'require' : 'disable';
  return `postgres://${auth}@${input.host}:${input.port}/${encodeURIComponent(input.database)}?sslmode=${sslmode}`;
}

/** Open a throwaway connection so a bad credential is a form error, not a crash. */
export async function testDatabase(input: DatabaseInput): Promise<{ version: string }> {
  const probe = new Pool({
    connectionString: connectionString(input),
    max: 1,
    connectionTimeoutMillis: 6000,
  });
  try {
    const res = await probe.query<{ version: string }>('SELECT version()');
    const full = res.rows[0]?.version ?? '';
    const major = Number(full.match(/PostgreSQL (\d+)/)?.[1] ?? 0);
    if (major && major < 14) {
      throw AppError.badRequest(
        `PostgreSQL 14 or newer is required; this server is ${major}.`,
        'install.postgres_too_old',
      );
    }
    return { version: full.split(',')[0] };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Driver messages here are the useful part — they name the actual problem
    // (wrong password, no such database, host unreachable).
    throw AppError.badRequest(`Could not connect: ${(err as Error).message}`, 'install.database_unreachable');
  } finally {
    await probe.end().catch(() => undefined);
  }
}

/** Apply the schema using the credentials just entered, not the running pool's. */
export async function migrate(databaseUrl: string): Promise<void> {
  try {
    // Deliberately the same npm script the documentation tells people to run,
    // rather than a second copy of the flags. The migrations are TypeScript and
    // need `-j ts --tsconfig`; a hand-written duplicate of that invocation drifts
    // the moment the script changes, and fails with a stack trace that says
    // nothing about the real cause.
    await run('npm', ['run', '--silent', 'migrate:up'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (err) {
    const detail = (err as { stderr?: string; message: string }).stderr || (err as Error).message;
    logger.error({ err }, 'Installer migration failed');
    throw AppError.badRequest(`Migration failed: ${detail.slice(-400)}`, 'install.migration_failed');
  }
}

export interface AdminInput {
  name: string;
  email: string;
  password: string;
}

export async function createAdmin(databaseUrl: string, input: AdminInput): Promise<void> {
  const probe = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 6000 });
  try {
    const role = await probe.query<{ id: string }>(`SELECT id FROM roles WHERE kode = 'super_admin'`);
    if (!role.rows[0]) {
      throw AppError.badRequest('Roles are missing — run the schema step first.', 'install.roles_missing');
    }

    const hash = await hashPassword(input.password);
    await probe.query(
      `INSERT INTO users (nama_lengkap, email, password_hash, role_id, status, email_verified_at)
       VALUES ($1,$2,$3,$4,'active', now())
       ON CONFLICT (email) WHERE deleted_at IS NULL AND email IS NOT NULL
         DO UPDATE SET nama_lengkap = EXCLUDED.nama_lengkap, password_hash = EXCLUDED.password_hash`,
      [input.name, input.email, hash, role.rows[0].id],
    );
  } finally {
    await probe.end().catch(() => undefined);
  }
}

/**
 * Merge values into `.env`, preserving anything already there.
 *
 * Rewritten rather than appended so re-running a step does not leave two
 * definitions of the same key, where the last one silently wins.
 */
export async function writeEnv(values: Record<string, string>): Promise<void> {
  let existing = '';
  try {
    existing = await readFile(ENV_PATH, 'utf8');
  } catch {
    // No .env yet — a fresh unpack. Start from the example if there is one.
    try {
      existing = await readFile(path.join(ROOT, '.env.example'), 'utf8');
    } catch {
      existing = '';
    }
  }

  const lines = existing.split('\n');
  const remaining = new Map(Object.entries(values));

  const merged = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of remaining) merged.push(`${key}=${value}`);

  await writeFile(ENV_PATH, merged.join('\n'), { mode: 0o600 });

  // `mode` on writeFile only applies when the file is created. Overwriting an
  // existing .env leaves whatever permissions it already had — typically 644,
  // which puts the database password and both signing secrets within reach of
  // every account on the box. Set it explicitly.
  await chmod(ENV_PATH, 0o600).catch(() => {
    logger.warn('Could not tighten permissions on .env — set them to 600 by hand');
  });
}

/** Secrets are generated, never asked for — a person choosing them picks badly. */
export function generateSecrets(): Record<string, string> {
  return {
    JWT_ACCESS_SECRET: crypto.randomBytes(48).toString('base64url'),
    JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('base64url'),
  };
}

/** Called once the final step succeeds, so the installer stops answering. */
export function markInstalled(): void {
  installedCache = true;
}
