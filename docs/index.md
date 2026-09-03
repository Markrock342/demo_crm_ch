# CANGZHAN — Architecture Map

สารบัญสถานะโปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代)  
Stack: Vite + React + Hono + PostgreSQL · Deploy: `democrmch.vercel.app`

## Modules

| Module | Doc | Status |
|--------|-----|--------|
| Basics UI shell (P0) | [basics-ui-p0.md](./basics-ui-p0.md) | Done (in-memory walkthrough) |
| Foundation (DB, migrate, pool, auth) | [foundation.md](./foundation.md) | Ready (await Vercel DATABASE_URL) |
| Finance AP (Vendor Bills) | [finance-ap.md](./finance-ap.md) | from-job + approve done |
| Mail & Docs persistence | [mail-docs.md](./mail-docs.md) | metadata+body done |
| Schema audit (2026-09-03) | [local/audits/databases/2026-09-03-cangzhan-schema-audit.md](./local/audits/databases/2026-09-03-cangzhan-schema-audit.md) | Reference (partially stale) |

## Key code map

| Area | Paths |
|------|-------|
| UI workspace | `src/pages/*`, `src/ui/*`, `src/index.css` |
| P0 shell / ports | `src/shell/*`, `src/ports/*`, `src/adapters/stub/*` |
| Client sync | `src/store.tsx`, `src/CrmSync.tsx`, `src/auth/*` |
| API | `server/app.ts`, `server/routes/*`, `api/**` |
| Domain | `server/services/*`, `server/domain/rbac.ts` |
| Schema / migrate | `server/db/schema/*`, `server/db/migrations/*`, `server/db/migrate.ts` |

## Locked product scope (current sprint)

- **P0 Basics UI shell** — Login+dept → CRM → Quote → Billing (empty in-memory) — **done**; ไม่แตะ `server/**` / `src/api/**` / logistics pages
- Next: **P1** stub remote เต็ม · **P2** logistics · **P3** ข้อ 8 architecture replan
- Prior backlog (Vendor Bills / mail-docs / boxes derive) — **done** on code; Vercel `DATABASE_URL` ยังรอ ops
