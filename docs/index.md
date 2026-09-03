# CANGZHAN — Architecture Map

สารบัญสถานะโปรเจกต์ CRM โลจิสติกส์จีน–ไทย (货代)  
Stack: Vite + React + Hono + PostgreSQL · Deploy: `democrmch.vercel.app`

## Modules

| Module | Doc | Status |
|--------|-----|--------|
| **Handoff (ศึกษา/ทำงานต่อ)** | [handoff-client-shell.md](./handoff-client-shell.md) | Current — อ่านก่อน |
| **LCS Phase A (Job 360)** | [lcs-phase-a.md](./lcs-phase-a.md) | **Closed** (shell A3 closeout + Deferred) |
| **LCS Phase B** | [lcs-phase-b.md](./lcs-phase-b.md) | **Closed** (tracking · vendors · rates · notify · portal) |
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

- **LCS Phase B** — tracking §5 · vendors · rates→quote · notifications · customer portal — **Closed** บน shell; ดู [lcs-phase-b.md](./lcs-phase-b.md)
- **LCS Phase A** — Job Detail 360 + A3 closeout — **Closed**; ดู [lcs-phase-a.md](./lcs-phase-a.md)
- **Client full shell** — densify UI · Ops · Logistics · Quote→Job→Bill — **done**; ไม่ต่อ API/DB
- Next: **Phase C** · stub → API · Vercel `DATABASE_URL`
- Prior: P0 basics shell · Vendor Bills / mail-docs — done on code; prod DB ยังรอ ops
