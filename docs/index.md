# CANGZHAN — Architecture Map

สารบัญสถานะโปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代)  
Stack: Vite + React + Hono + PostgreSQL · Deploy: `democrmch.vercel.app`

## Modules

| Module | Doc | Status |
|--------|-----|--------|
| **Handoff (ศึกษา/ทำงานต่อ)** | [handoff-client-shell.md](./handoff-client-shell.md) | Current — อ่านก่อน |
| Client full shell | [client-full-shell.md](./client-full-shell.md) | Done (localStorage walkthrough) |
| Basics UI shell (P0) | [basics-ui-p0.md](./basics-ui-p0.md) | Done (superseded by full shell) |
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

- **Client full shell** — densify UI · Ops · Logistics · Quote→Job→Bill · Rates/Tasks/Docs/VB stub — **done** on client; ไม่ต่อ API/DB
- Next: stub → API adapters · Inbox/Reports · Vercel `DATABASE_URL` · architecture replan (ข้อ 8)
- Prior: P0 basics shell · Vendor Bills / mail-docs / boxes derive — done on code; prod DB ยังรอ ops
