# CANGZHAN — Demo → Production Migration Plan

## Repository audit (2026-03)

### What exists today

| Layer | Files | Role |
|-------|-------|------|
| **UI shell** | `src/App.tsx`, pages, ledger cards, i18n | Full CRM/logistics demo — **preserve** |
| **Client state** | `src/store.tsx` | React state + localStorage (`cangzhan-demo-v4`) — **replace for ops data** |
| **Seed data** | `src/data.ts`, `src/crm.ts`, `src/logistics.ts` | Demo customers, boxes, deals, shipments — **keep as seed source** |
| **Mail ops** | `src/ops.ts` | Applies AI analysis to boxes/docs/tasks — **move to server domain service** |
| **AI (client)** | `src/ai/client.ts` | Calls `/api/ai/*` — **preserve** |
| **AI (server)** | `server/analyze.ts`, `server/gemini.ts`, `server/schema.ts` | Gemini mail + brief — **preserve & extend** |
| **API** | `server/app.ts`, `api/ai/*.ts` | Hono + Vercel serverless — **extend** |
| **Domain gap** | — | No PostgreSQL, auth, rates, quotations, milestones, vendors, audit |

### Duplicated / demo-only concepts

- `Box` (client) ≈ future `ShipmentContainer` — gradual rename, keep Boxes UI
- `Shipment` (`logistics.ts`) — thin; needs Job/Booking/Milestone model
- `Invoice` — too simple; evolve to Revenue/Cost/Invoice/VendorBill
- `Deal` pipeline — maps to `Opportunity` → `Quotation` → `Booking`
- Customer `boxes` count — denormalized; compute from containers
- Reports KPIs — mix of computed + hardcoded; wire to DB aggregates
- `localStorage` — entire CRM persisted client-side (**not production-safe**)

### Reusable UI (do not redesign)

Overview, Customers, Contacts, Leads, Pipeline, Shipments, Boxes, Yard, Inbox, Docs, Tasks, Calendar, Reports, Account, Settings, Command palette, mobile ledger cards, AI brief chat.

---

## Target architecture

```
Browser (existing React UI)
  → /api/* (Hono, Zod, RBAC)
    → Domain services
      → PostgreSQL (Drizzle ORM)
      → Audit log (immutable)
  → Gemini (mail, brief, query assistant)
```

**localStorage** (after Phase 1): `locale`, `compact`, `motion` only.

**Session**: JWT httpOnly cookie when `DATABASE_URL` configured; demo mode without DB still works from seed.

---

## Phased delivery

### Phase 1 — Foundation ✅ (this commit)

- PostgreSQL + Drizzle schema
- Users, Roles, Permissions, RBAC
- Auth API (`/api/auth/login|me|logout`)
- Audit log table + write helper
- Seed: roles, permissions, demo users
- Login page + AuthProvider
- Store: UI prefs only in localStorage
- `docker-compose.yml` for local Postgres

### Phase 2 — CRM core API ✅ (this commit)

- Customers, Contacts, Leads, Opportunities (PostgreSQL + Drizzle)
- REST API: `/api/customers`, `/api/contacts`, `/api/leads`, `/api/opportunities`
- Demo seed from existing `src/data.ts` + `src/crm.ts`
- Frontend `CrmSync` hydrates store from API in production mode
- Write-through for CRM mutations when API enabled
- Audit log on CRM creates/updates

### Phase 3 — Commercial workflow ✅ (partial — core path)

**Schema** (`0002_commercial_workflow.sql`):
- Vendors, RateSheet, RateLane, RateCharge
- Quotations, QuotationRevisions, QuotationCharges (immutable after send)
- ApprovalRequests, QuoteAcceptanceTokens, QuoteSignatures
- Bookings, Jobs, ShipmentCharges
- Invoices, InvoiceLines, BillingNotes, Payments, PaymentAllocations, VendorBills
- Currencies, ExchangeRates, TaxCodes, DocSequences

**API** (RBAC enforced):
- `GET /api/rates/search` — buy/sell/margin filtered by role
- `POST /api/quotations/from-rate` — server-side margin calc
- Approval: submit → approve/reject
- Send → public token `/q/:token`
- `POST /api/public/quotes/:token/sign` — e-sign evidence
- Quote → Booking → Job with charge copy
- `GET /api/jobs/:id/financials` — P&L
- Invoice from job, issue, payment allocation, AR summary

**UI** (existing design language):
- `/rates` — Rate Search
- `/quotations` — quote workflow
- `/q/:token` — customer acceptance (no login)

**Still TODO in Phase 3:**
- Customer master field expansion (Customer 360 tabs)

**Added in latest iteration:**
- Quotation PDF (`GET /api/quotations/:id/pdf`)
- Billing Note PDF + create (`POST /api/billing-notes`, `GET .../pdf`)
- `/jobs` page with Financial tab (P&L)
- `/invoices` page — issue, billing note, partial payments, AR buckets
- Quote → Booking → **Create Job** button in Quotations UI

### Phase 4 — Operations (partial)

- Jobs table + shipment charges from quotes ✅
- Milestones, container DB persistence — **TODO**
- Boxes UI → container ops API — **TODO**

### Phase 5 — Finance (partial)

- Invoice + payment APIs ✅
- `/invoices` UI — issue, billing note, payment ✅
- Vendor bills UI, credit notes, freight bill audit — **TODO**
- Shipment financial tab wired via `/jobs` Financial tab ✅

### Phase 6 — Email persistence

- EmailAccount, Thread, Message, Attachment
- Inbox UI unchanged; backend storage

### Phase 7 — AI assistant

- `/api/ai/query` — safe structured queries + RBAC
- Extend mail analysis actions (suggest → confirm → execute)

### Phase 8 — Reporting

- KPI aggregates from DB
- Role-aware dashboards
- AI report summaries

---

## Environment

```env
DATABASE_URL=postgresql://cangzhan:cangzhan@localhost:5432/cangzhan
JWT_SECRET=change-me-in-production
GEMINI_API_KEY=
```

Local DB: `docker compose up -d` then `npm run db:migrate` and `npm run db:seed`.
