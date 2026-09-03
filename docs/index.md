# CANGZHAN — Architecture Map

สารบัญสถานะโปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代)  
Stack: Vite + React + Hono + PostgreSQL · Deploy: `democrmch.vercel.app`

## Modules

| Module | Doc | Status |
|--------|-----|--------|
| Foundation (DB, migrate, pool, auth) | [foundation.md](./foundation.md) | Ready (await Vercel DATABASE_URL) |
| Finance AP (Vendor Bills) | [finance-ap.md](./finance-ap.md) | from-job + approve done |
| Mail & Docs persistence | [mail-docs.md](./mail-docs.md) | metadata+body done |
| Schema audit (2026-09-03) | [local/audits/databases/2026-09-03-cangzhan-schema-audit.md](./local/audits/databases/2026-09-03-cangzhan-schema-audit.md) | Reference (partially stale) |

## Key code map

| Area | Paths |
|------|-------|
| UI workspace | `src/pages/*`, `src/ui/*`, `src/index.css` |
| Client sync | `src/store.tsx`, `src/CrmSync.tsx`, `src/auth/*` |
| API | `server/app.ts`, `server/routes/*`, `api/**` |
| Domain | `server/services/*`, `server/domain/rbac.ts` |
| Schema / migrate | `server/db/schema/*`, `server/db/migrations/*`, `server/db/migrate.ts` |

## Locked product scope (current sprint)

- Mode: API + `DATABASE_URL` primary (Demo branding only)
- Vendor Bills: from-job + approve (no AP payment) — **done**
- Customer 360: no field expansion — wire existing commercial APIs — **done**
- Mail/docs: metadata + body in PostgreSQL — **done**
- Post-sprint architecture replan deferred
- **Ops:** set Vercel pooled `DATABASE_URL` + `DB_POOL_MAX=1`, then migrate/seed
