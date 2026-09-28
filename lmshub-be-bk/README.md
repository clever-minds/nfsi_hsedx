# lmshub-be — LMS Hub Backend

REST API and business engine for LMS Hub. Node.js · Express · TypeScript · PostgreSQL · Redis (optional).

## Requirements

- Node.js ≥ 20
- PostgreSQL ≥ 14 with the `pgcrypto` and `citext` extensions
- Redis — optional; no core feature requires it

## Running

```bash
cp .env.example .env          # set DATABASE_URL, the two JWT secrets, etc.
npm install
npm run migrate:up            # all migrations — 91 tables + RBAC and settings seed
npm run seed                  # bootstrap super admin from .env + default branding
npm run dev                   # http://localhost:4000
```

Check: `curl http://localhost:4000/api/v1/health` → `{"data":{"status":"ok"...}}`

Sign in: `POST /api/v1/auth/login` with `{ "identifier": "<BOOTSTRAP_ADMIN_EMAIL>", "password": "<BOOTSTRAP_ADMIN_PASSWORD>" }`.
The identifier field accepts an email address or a WhatsApp number.

## Scripts

| Script | Does |
|--------|------|
| `npm run dev` | Development server (tsx watch) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run migrate:up` / `migrate:down` | Migrate up / roll back one step |
| `npm run seed` | Super admin + default branding. **The only seed for production** |
| `npm run seed:demo` | Sample content — development only |
| `npm run db:reset` | Drop, create, migrate, seed, seed demo — **development only, deletes everything** |
| `npm test` | Unit tests (vitest) |
| `npm run test:features` | End-to-end feature suite against a running server |

## Architecture

- `src/core/` — shared kernel: `config`, `db` (pool + `withTransaction`), `http` (envelope, `AppError`, error handler, pagination), `validation` (zod), `auth` (jwt, password, Google), `rbac` (`requireAuth`, `requirePermission`), `mail`, `payment`, `settings`, `audit`, `logger`.
- `src/modules/<domain>/` — `routes` · `controller` · `service` · `repository` · `validation`. Routers are mounted in `src/routes.ts`.
- `migrations/` — node-pg-migrate in TypeScript. The only source of schema truth; there is no SQL dump.
- `assets/branding/` — default logo and icon installed by `npm run seed`.

Conventions: REST under `/api/v1`, envelope `{ data, meta, error }`, JWT access + refresh, money as integer or `numeric` (never float), time as UTC `timestamptz`, soft delete via `deleted_at`. Financial operations and certificate issue are always wrapped in a database transaction.

> Route mount order in `src/routes.ts` is deliberate: a router carrying public routes must be mounted before the first root-mounted router that applies `requireAuth()` globally, or its public paths answer 401.

## Modules

`auth`, `users` (RBAC), `categories`, `courses`, `curriculum`, `media`, `enrollments`, `progress`, `assessments`, `grading`, `orders` (transactions, payment, refund, revenue share), `marketing` (affiliate, commission), `live`, `discussions`, `certificates`, `notifications`, `reports` (finance, payout), `reviews`, `dashboard`, `documents` (pages, settings, audit), `bank-accounts`, `site-content` — 269 endpoints.

Full API reference, data model and installation guide: see the PDF manuals shipped with this product.
