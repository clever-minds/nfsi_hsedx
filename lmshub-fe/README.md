# lmshub-fe — LMS Hub Frontend

One Vue 3 + TypeScript application serving both faces of the platform: the public
area (landing, catalogue, course detail, registration, checkout) and the locked
multi-role dashboard. Vite · Pinia · Vue Router · Tailwind.

There is no separate marketing-site repository — both areas are routes in this app.

## Requirements

- Node.js ≥ 20
- A running `lmshub-be` backend (the dev server proxies `/api` to `http://localhost:4000`)

## Running

```bash
npm install
npm run dev        # http://localhost:5173
```

> Backend on a different port? Set `VITE_API_URL` or edit the proxy in `vite.config.ts`.

Production build: `npm run build` · Typecheck: `npm run typecheck` (vue-tsc).

`VITE_API_URL` is **build-time** — it is baked into the bundle, so changing the API
address means rebuilding. Leave it unset for a single-domain deployment where Nginx
proxies `/api`.

## Structure

- `src/lib/api.ts` — axios, envelope `{ data, meta, error }`, transparent JWT refresh.
- `src/stores/auth.ts` — Pinia: user, roles, `can('module.action')`, active role.
- `src/lib/can.ts` — `v-can="'kursus.view'"` directive for gating UI.
- `src/router/` — `requiresAuth` + `permission` guards; module routes aggregated in `modules.ts`.
- `src/layouts/` — `PublicLayout` (pre-login), `DashboardLayout` (sidebar + topbar).
- `src/components/ui/` — KpiCard, StatusChip, DataTable, PageHeader, CourseCard, DonutChart, and friends.
- `src/config/nav.ts` — dashboard navigation, gated per permission.
- `src/i18n/messages/{en,id,ar,hi}/` — translation catalogues; Arabic mirrors the layout right-to-left.
- `src/modules/<name>/` — views plus `<name>.routes.ts`.

## Modules

`auth`, `catalog` (public landing, catalogue, detail), `dashboard`, `users`,
`courses`, `content` (curriculum builder + media), `enrollment`, `learn` (course
player), `assessments`, `grading`, `orders` (transactions + deposit entry),
`marketing` (lead pipeline + commission), `reports` (finance + payout), `settings`,
`audit`, `live`, `discussions`, `certificates`, `notifications`, `website`.

## Demo accounts

After `npm run seed` and `npm run seed:demo` on the backend:

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@lmshub.test` | `Admin12345!` |
| Instructor | `rina@lmshub.test` | `Demo12345!` |
| Student | `siti@lmshub.test` | `Demo12345!` |

Screen-by-screen documentation: see the PDF manuals shipped with this product.
