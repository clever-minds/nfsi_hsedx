import { Request, Response } from 'express';
import { ok } from '../../core/http/envelope';
import { AppError } from '../../core/http/AppError';
import * as service from './install.service';

/**
 * Installer endpoints. Unauthenticated by necessity — there is nobody to
 * authenticate as yet — so every one of them refuses once a super admin exists.
 */

export async function status(_req: Request, res: Response) {
  const installed = await service.isInstalled();
  return ok(res, {
    installed,
    requirements: installed ? [] : await service.requirements(),
    node: process.versions.node,
  });
}

export async function testDatabase(req: Request, res: Response) {
  await service.assertNotInstalled();
  const input = readDatabase(req);
  const result = await service.testDatabase(input);
  return ok(res, result);
}

/** Applies the schema. Credentials travel with the request; nothing is stored yet. */
export async function migrate(req: Request, res: Response) {
  await service.assertNotInstalled();
  const url = service.connectionString(readDatabase(req));
  await service.testDatabase(readDatabase(req));
  await service.migrate(url);
  return ok(res, { migrated: true });
}

/**
 * Final step: create the admin, then write `.env`.
 *
 * Ordered deliberately. Writing credentials first and failing to create an
 * admin would leave a configured system nobody can sign in to, and the
 * installer would have locked itself as soon as the file landed.
 */
export async function finish(req: Request, res: Response) {
  await service.assertNotInstalled();

  const db = readDatabase(req);
  const url = service.connectionString(db);
  const admin = readAdmin(req);
  const site = readSite(req);

  await service.createAdmin(url, admin);

  await service.writeEnv({
    DATABASE_URL: url,
    APP_URL: site.appUrl,
    PUBLIC_WEB_URL: site.webUrl,
    CORS_ORIGIN: site.webUrl,
    BOOTSTRAP_ADMIN_EMAIL: admin.email,
    BOOTSTRAP_ADMIN_NAME: admin.name,
    NODE_ENV: 'production',
    ...service.generateSecrets(),
  });

  service.markInstalled();
  return ok(res, { installed: true });
}

// ── Input ────────────────────────────────────────────────────────────────

function str(req: Request, field: string, max = 200): string {
  const value = (req.body?.[field] ?? '').toString().trim();
  if (!value) throw AppError.badRequest(`${field} is required`, 'install.field_required');
  if (value.length > max) throw AppError.badRequest(`${field} is too long`, 'install.field_too_long');
  return value;
}

function readDatabase(req: Request): service.DatabaseInput {
  const port = Number(req.body?.port ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw AppError.badRequest('Port must be a number between 1 and 65535', 'install.bad_port');
  }
  return {
    host: str(req, 'host'),
    port,
    database: str(req, 'database'),
    user: str(req, 'user'),
    // A blank password is legitimate on trust-authenticated local servers.
    password: (req.body?.password ?? '').toString(),
    ssl: req.body?.ssl === true || req.body?.ssl === 'true',
  };
}

function readAdmin(req: Request): service.AdminInput {
  const password = str(req, 'adminPassword', 200);
  if (password.length < 10) {
    throw AppError.badRequest('The admin password must be at least 10 characters', 'install.weak_password');
  }
  const email = str(req, 'adminEmail');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw AppError.badRequest('That email address does not look valid', 'install.bad_email');
  }
  return { name: str(req, 'adminName'), email, password };
}

function readSite(req: Request): { appUrl: string; webUrl: string } {
  const appUrl = str(req, 'appUrl', 300).replace(/\/+$/, '');
  const webUrl = str(req, 'webUrl', 300).replace(/\/+$/, '');
  for (const url of [appUrl, webUrl]) {
    if (!/^https?:\/\//.test(url)) {
      throw AppError.badRequest('Addresses must start with http:// or https://', 'install.bad_url');
    }
  }
  return { appUrl, webUrl };
}
