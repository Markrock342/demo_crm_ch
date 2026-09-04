# CANGZHAN LogisticsOS — Production V2 Status

Branch: `feature/logisticsos-ui-v2`  
Last updated: 2026-09-04

## Goal

Convert demo CRM shell → production-grade, multi-tenant Freight Forwarding TMS without big-bang rewrite.

Reference brief: `LOGISTICSOS_V2_BRIEF.md`

---

## Phase summary

| Phase | Scope | Status |
|-------|--------|--------|
| **P0** | DB hardening, dates, tenancy, auth foundation | **PARTIAL** |
| **P1** | Ant Design V2 shell, theme, shared primitives | **IN PROGRESS** |
| P2 | Customers → Rates → Quotations | NOT STARTED |
| P3 | Jobs → Job Detail → Shipments → Containers → Milestones | NOT STARTED |
| P4 | Documents + storage + PDF Template Studio (pdfme) | NOT STARTED |
| P5 | Invoices/AP/Payments + financial reports | NOT STARTED |
| P6 | Inbox/email + tracking + notifications + automation | NOT STARTED |
| P7 | Customer Portal | NOT STARTED |
| P8 | Analytics / FullCalendar / QA / security | NOT STARTED |

---

## P0 — DONE / BLOCKED / NEXT

### DONE
- Removed hard-coded dashboard dates (`todayKey = "09-04"`, invoice cutoff `"2026-09-04"`)
- Added `src/lib/dates.ts` — tenant timezone helpers (`Asia/Bangkok` default)
- Unit tests: `server/lib/dates.test.ts` (mirrors `src/lib/dates.ts`)

### BLOCKED
- Migration ledger audit (existing `server/db/migrate.test.ts` — needs full P0 review)
- Document-number concurrency race
- Serverless DB pooling / TLS / PITR
- Multi-tenant `organizations` schema + session-scoped tenant resolution
- Production auth (MFA, invite, session revoke)

### NEXT
- Tenant table + FK indexes + status constraints migration
- Automated tenant isolation tests
- Resolve shell vs production API gaps before page rewrites

---

## P1 — DONE / BLOCKED / NEXT

### DONE
- Dependencies: `antd`, `@ant-design/pro-components`, `@ant-design/charts`, `@tanstack/react-query`, FullCalendar packages, `@pdfme/*`, `dayjs`
- `src/v2/theme.ts` — enterprise logistics theme tokens
- `src/v2/AppShell.tsx` — ProLayout shell (default on branch; set `VITE_UI_V2=false` for legacy)
- `src/v2/navConfig.ts` — LogisticsOS navigation groups
- `src/v2/components/*` — PageHeader, StatusTag, Money, EntityLink, Empty/Loading/Error states
- `src/v2/providers/AppProviders.tsx` — ConfigProvider + QueryClient
- `src/AppRoutes.tsx` — shared route table (legacy + V2)
- Legacy shell preserved as `LegacyAppShell` for rollback

### BLOCKED
- Individual pages still use custom CSS / PageToolbar — not yet migrated to V2 primitives
- ProTable wrapper, DrawerForm, ActionCenter component, DocumentPreview, FileUploader — not built
- FullCalendar not wired (Calendar.tsx still custom)
- pdfme Designer page not built

### NEXT
- ProTable wrapper + migrate Jobs list first (production API)
- Page-by-page V2 migration following P2→P3 order
- Wire TanStack Query to production endpoints; stop duplicating shell stores on live paths

---

## Known shell vs production gaps (do not mask with UI)

| Area | Shell | Production API |
|------|-------|----------------|
| Job Detail | Full 360 panels | Thin `LiveJobDetailBody` |
| Quotations / Rates | Wizard + stores | Partial / stub |
| Documents | Metadata | No object storage |
| Portal | PIN demo | No real customer auth |
| Container tracking | `trackingMock` | No TrackingProvider |
| Inbox | Store sandbox | Needs provider abstraction |

---

## Quality gate (per module)

Before marking any module **DONE**:

- [ ] Production API connected
- [ ] PostgreSQL persistence
- [ ] Tenant isolation + server-side RBAC
- [ ] Loading / empty / error states
- [ ] No hard-coded dates
- [ ] No mock data in production path
- [ ] `npm run build` + `npm run lint` + `npm test` pass

---

## Commands

```bash
# V2 UI (default on this branch)
npm run dev

# Legacy shell
VITE_UI_V2=false npm run dev

npm run build
npm run test
tsx --test server/lib/dates.test.ts
```
