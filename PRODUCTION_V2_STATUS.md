# CANGZHAN LogisticsOS — Production V2 Status

Branch: `feature/logisticsos-ui-v2`  
Last updated: 2026-09-04 (P2–P3 bulk wire-up)

## Goal

Convert demo CRM shell → production-grade, multi-tenant Freight Forwarding TMS without big-bang rewrite.

---

## Phase summary

| Phase | Scope | Status |
|-------|--------|--------|
| **P0** | DB hardening, dates, tenancy, auth foundation | **PARTIAL** |
| **P1** | Ant Design V2 shell, theme, shared primitives | **DONE** |
| **P2** | Customers → Rates → Quotations | **PARTIAL** (V2 UI + live API on Rates/Quotes list) |
| **P3** | Jobs → Job Detail → Shipments → Containers → Milestones | **PARTIAL** (Jobs/Containers/Calendar done; Shipments shell) |
| P4 | Documents + storage + PDF Template Studio (pdfme) | NOT STARTED |
| **P5** | Invoices/AP/Payments + financial reports | **PARTIAL** (Invoices V2 + list API) |
| P6 | Inbox/email + tracking + notifications + automation | NOT STARTED |
| P7 | Customer Portal | NOT STARTED |
| **P8** | Analytics / FullCalendar / QA / security | **PARTIAL** (FullCalendar wired; charts/reports pending) |

---

## P0 — DONE / BLOCKED / NEXT

### DONE
- Hard-coded dates removed (`src/lib/dates.ts`)
- `server/lib/dates.test.ts`

### BLOCKED
- Multi-tenant org schema + session tenant resolution
- Document-number concurrency, pooling/PITR, MFA/invite

### NEXT
- Tenant isolation tests + migrations

---

## P1 — DONE

- Ant Design ProLayout shell (`src/v2/AppShell.tsx`)
- Theme, PageHeader, StatusTag, Money, states
- TanStack Query (`AppProviders`, query keys)
- `VITE_UI_V2=false` → legacy shell rollback

---

## P2 — DONE / BLOCKED / NEXT

### DONE
- `CustomersPageV2` — ProTable (shell + CrmSync production customers)
- `RatesPageV2` — shell rates + live `searchRates` API
- `QuotationsPageV2` — shell quotes + live `fetchQuotations`

### BLOCKED
- Quote Wizard V2 / approval workflow UI
- Rate create/edit production forms
- Customer 360 V2 (Account page still legacy)

### NEXT
- Quote Builder steps on production API
- Customer detail tabs wired to live data

---

## P3 — DONE / BLOCKED / NEXT

### DONE
- **Backend:** `GET /api/jobs` enriched with `grossProfit`, `billingStatus`, pagination `{ total, limit, offset }` via `job-enrichment.service.ts`
- **Backend:** `GET /api/containers?jobId=` filter
- `JobsPageV2` + `JobsProTable` (live GP column)
- `JobDetailLiveV2` tabs: Overview, Milestones, Charges, **Containers**, **Documents**, **Invoices**
- `ContainersPageV2` (Boxes route)
- `ExceptionsPageV2` (Action Center)
- `OverviewPageV2` — KPI cards, works in shell + production

### BLOCKED
- Shipments page (still shell store)
- Job Detail: Tasks, Emails, Activity tabs on production
- Server-side ProTable pagination/filters (client-side only)

### NEXT
- Shipments ↔ Job canonical model on API
- Milestone PATCH from UI

---

## P5 — DONE / BLOCKED / NEXT

### DONE
- `InvoicesPageV2` — live `fetchInvoices` + shell fallback

### BLOCKED
- Vendor Bills V2, Payments UI, AR aging charts
- Invoice create/issue from V2 Job Detail

### NEXT
- VendorBills ProTable + pay flow

---

## P8 — DONE / BLOCKED / NEXT

### DONE
- `CalendarPageV2` — FullCalendar (ETD/ETA/tasks/activities)

### BLOCKED
- Reports/analytics charts (`@ant-design/charts` not wired)
- Playwright E2E critical path
- Code-splitting (bundle ~2.7MB)

### NEXT
- Reports page with server aggregates
- Lazy-load FullCalendar + pdfme

---

## V2 page map (default when `VITE_UI_V2` ≠ false)

| Route | V2 component |
|-------|----------------|
| `/` | OverviewPageV2 |
| `/exceptions` | ExceptionsPageV2 |
| `/customers` | CustomersPageV2 |
| `/rates` | RatesPageV2 |
| `/quotations` | QuotationsPageV2 |
| `/jobs` | JobsPageV2 |
| `/jobs/:id` | JobDetailLiveV2 (production) |
| `/invoices` | InvoicesPageV2 |
| `/boxes` | ContainersPageV2 |
| `/calendar` | CalendarPageV2 |

Legacy pages still active: Shipments, Inbox, Docs, Portal, Settings, Vendor Bills, Tasks, Reports, Automation, Yard, Quote Wizard.

---

## Quality gate checklist (whole product)

- [x] No hard-coded dashboard dates
- [x] `npm run build` passes
- [x] `npm test` passes
- [ ] Tenant isolation
- [ ] All routes production-backed (no shell in live path)
- [ ] Document file storage
- [ ] Portal real auth
- [ ] pdfme template studio

---

## Commands

```bash
npm run dev                    # V2 default
VITE_UI_V2=false npm run dev   # legacy
npm run build && npm test
```
