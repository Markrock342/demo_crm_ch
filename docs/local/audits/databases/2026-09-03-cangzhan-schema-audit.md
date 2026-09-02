# DATABASES — CANGZHAN schema & ops audit

**Date:** 2026-09-03  
**Engine:** PostgreSQL 16 (local Docker) / managed Postgres on Vercel (production target)  
**Scope:** Schema design (`0000`–`0002`), Drizzle ORM, migrate runner, connection config, hot-query alignment  
**Workload:** OLTP freight CRM — rates → quote → job → invoice; read-heavy dashboards, moderate writes on commercial path

---

## Executive summary

The commercial workflow schema is **structurally sound for an MVP**: money in `NUMERIC`, timestamps mostly `timestamptz`, FK graph matches the business flow, and core list queries have *some* indexes. Gaps that will hurt production first: **(1) no migration ledger**, **(2) doc-number race under concurrency**, **(3) missing FK indexes on `shipment_charges.job_id` and `invoice_lines.invoice_id`**, **(4) serverless connection sprawl without PgBouncer**, **(5) denormalized `customers.boxes` with no sync owner**.

Recommended next migration: `0003_ops_hardening.sql` — migration table, FK indexes, CHECK on status enums, fix sequence locking.

---

## Domain map (current)

```
customers ─┬─ contacts, opportunities, quotations, bookings, jobs, invoices, payments
           └─ (denorm) boxes count

vendors ─ rate_sheets ─ rate_lanes ─ rate_charges
quotations ─ quotation_revisions ─ quotation_charges
         └─ quote_acceptance_tokens, quote_signatures
bookings ─ jobs ─ shipment_charges ─ invoice_lines ─ invoices ─ payment_allocations
                              └─ vendor_bills (AP, schema only)
```

**Not yet in DB:** containers/boxes, milestones, shipments mirror, mail/docs persistence (still client seed).

---

## Query → index alignment (Step 1 hot paths)

| Query (service) | Filter / join columns | Index today | Verdict |
|---|---|---|---|
| Rate search (`rate.service`) | `rate_lanes.origin/destination`, join `rate_sheets`, validity | `rate_lanes_search_idx (origin, destination, container_type)` | **Partial** — `ILIKE '%x%'` prevents btree use; OK at demo scale |
| Jobs list (`operations.service`) | `jobs.customer_id`, order `created_at` | `jobs_customer_idx (customer_id)` | **OK** — add `(customer_id, created_at DESC)` for sort |
| Job financials | `shipment_charges.job_id` | **none** | **P1 — add index** |
| Bookings by quote | `bookings.quotation_id` | **none** | **P1** |
| Invoices AR summary | `invoices.status IN ('ISSUED','PARTIALLY_PAID')` | `invoices_customer_status_idx` | **Partial** — needs `(status)` or partial index |
| Invoice detail | `invoice_lines.invoice_id` | **none** | **P1** |
| Billing note PDF | `billing_note_items.billing_note_id` | **none** | **P2** |
| Doc sequences | `doc_sequences (kind, year)` PK | PK | **OK** — locking model broken (see P0) |

---

## Findings

### P0 — Fix before production traffic

#### P0-1 · Migration runner has no ledger

**Where:** `server/db/migrate.ts`  
**Issue:** Re-executes every `.sql` file on each `npm run db:migrate`. Files use `IF NOT EXISTS`, so re-runs usually succeed, but:
- No record of applied version
- Future non-idempotent DDL (data backfill, `DROP`, enum changes) will be unsafe
- Cannot detect partial failure mid-file

**Fix:**
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```
Runner: skip files already in table; wrap each file in a transaction; insert row on success.

**Rollback:** Drop `schema_migrations` row and manually reverse DDL if needed.

---

#### P0-2 · Document number race (`doc_sequences`)

**Where:** `server/services/sequence.service.ts`  
**Issue:** `SELECT` → increment → `UPDATE` without row lock. Two concurrent quote/job creates can get the same sequence.

**Fix (inside transaction):**
```sql
SELECT last_seq FROM doc_sequences
WHERE kind = $1 AND year = $2
FOR UPDATE;
-- then UPDATE ...
```
Or: `UPDATE doc_sequences SET last_seq = last_seq + 1 ... RETURNING last_seq`.

**Rollback:** N/A (preventive).

---

#### P0-3 · Serverless connection budget

**Where:** `server/db/index.ts` — `postgres(url, { max: 10 })`  
**Issue:** Each Vercel serverless instance opens up to 10 connections. Fleet × 10 can exceed Postgres `max_connections` (default 100 on small plans).

**Fix:** Managed Postgres + **PgBouncer** (transaction mode) in front; app `max: 1–3` per instance. Or use Neon/Vercel Postgres with built-in pooling.

**Validate:** `SHOW POOLS;` under load; watch `cl_waiting`.

---

### P1 — Schema correctness & performance

#### P1-1 · Missing FK indexes (PostgreSQL does not auto-index FKs)

Add in `0003` (use `CREATE INDEX CONCURRENTLY` in prod):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rate_sheets_vendor ON rate_sheets (vendor_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rate_charges_lane ON rate_charges (rate_lane_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotation_revisions_quote ON quotation_revisions (quotation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_quotation ON bookings (quotation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_booking ON jobs (booking_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_quotation ON jobs (quotation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipment_charges_job ON shipment_charges (job_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines (invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_billing_note_items_bn ON billing_note_items (billing_note_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations (payment_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations (invoice_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_status ON invoices (status) WHERE status IN ('ISSUED','PARTIALLY_PAID','DRAFT');
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_customer_created ON jobs (customer_id, created_at DESC);
```

---

#### P1-2 · Free-text status columns (invalid states representable)

**Tables:** `quotations.status`, `jobs.status`, `invoices.status`, `bookings.status`, `leads.stage`, `opportunities.stage`, etc.

**Fix:** Add CHECK constraints per domain, e.g.:
```sql
ALTER TABLE quotations ADD CONSTRAINT quotations_status_chk
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACCEPTED','REJECTED','EXPIRED'));
```
Apply expand-contract: add CHECK as `NOT VALID`, backfill bad rows, `VALIDATE CONSTRAINT`.

---

#### P1-3 · Denormalized `customers.boxes`

**Where:** `customers.boxes` integer, seeded from demo  
**Issue:** No trigger or job to recompute from future `containers` table. Will drift when Boxes UI wires to API.

**Fix options:**
1. **Preferred:** Drop column; compute `COUNT(*)` from `containers WHERE customer_id = …` (materialized view if hot).
2. **If kept:** Trigger on container insert/update/delete maintaining count; document owner in schema comment.

---

#### P1-4 · Implicit `ON DELETE` on commercial FKs

Many FKs use default `NO ACTION` (e.g. `quotations.customer_id`, `rate_sheets.vendor_id`). Deleting a customer blocks if quotes exist — may be intended, but should be **explicit** `RESTRICT` in DDL and documented.

**Fix:** New migration alters FKs to named `ON DELETE RESTRICT` or `SET NULL` where business allows.

---

#### P1-5 · Money on opportunities

`opportunities.value integer` — likely whole currency units without minor units or currency column.

**Fix:** `value_cents BIGINT NOT NULL DEFAULT 0 CHECK (value_cents >= 0)` + `currency text NOT NULL DEFAULT 'THB'`, or `NUMERIC(19,4)`.

---

### P2 — Design debt / Phase 4 prep

| Item | Issue | Recommendation |
|---|---|---|
| Text PKs (`c1`, `demo-q1`) | Carried from demo seed | New entities: `BIGINT GENERATED ALWAYS AS IDENTITY` or UUIDv7; keep text IDs for seed compat via migration |
| `jobs.etd`, `jobs.eta` as `text` | No date math, sort breaks | `date` or `timestamptz` |
| `customers.updated`, `leads.updated` as text | Display string not temporal | Use `updated_at timestamptz` only; drop text column |
| Rate search `ILIKE '%…%'` | Seq scan at scale | `pg_trgm` GIN indexes or require prefix search |
| No containers/milestones tables | Boxes/Shipments UI still on client seed | See proposed DDL below |
| Docker Postgres | Weak creds, no TLS, no backup volume policy | Dev only; production = managed + TLS + PITR |
| `audit_logs` | Append-only, no retention/partition | Partition by month or archive job when >10M rows |

---

## Proposed Phase 4 DDL (sketch)

```sql
-- Operations persistence (align with Boxes / Shipments UI)
CREATE TABLE containers (
  id            text PRIMARY KEY,  -- or BIGINT identity in greenfield
  job_id        text REFERENCES jobs(id) ON DELETE SET NULL,
  customer_id   text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  container_no  text NOT NULL UNIQUE,
  type          text NOT NULL,
  status        text NOT NULL CHECK (status IN ('yard','sail','clear','hold','empty')),
  direction     text NOT NULL CHECK (direction IN ('in','out')),
  bl            text,
  pol           text,
  pod           text,
  teu           integer NOT NULL DEFAULT 1 CHECK (teu > 0),
  eta           date,
  yard_code     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_containers_customer ON containers (customer_id);
CREATE INDEX idx_containers_job ON containers (job_id);
CREATE INDEX idx_containers_status ON containers (status) WHERE status IN ('yard','hold');

CREATE TABLE job_milestones (
  id          text PRIMARY KEY,
  job_id      text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  code        text NOT NULL,
  label       text NOT NULL,
  planned_at  timestamptz,
  actual_at   timestamptz,
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE (job_id, code)
);
CREATE INDEX idx_milestones_job ON job_milestones (job_id, sort_order);
```

---

## Migration plan (0003_ops_hardening — ordered, reversible)

| Step | Forward | Rollback |
|---|---|---|
| 1 | Create `schema_migrations` + backfill applied files | Drop table |
| 2 | `CREATE INDEX CONCURRENTLY` FK indexes (list above) | `DROP INDEX CONCURRENTLY` each |
| 3 | Fix `sequence.service` to `FOR UPDATE` | Revert app code |
| 4 | Add CHECK constraints `NOT VALID` → validate | `DROP CONSTRAINT` |
| 5 | (Optional) Drop `customers.boxes` after containers table + view | Re-add column + backfill |

**Deploy order:** migrate → deploy API with sequence fix → deploy UI. No downtime for indexes if `CONCURRENTLY`.

---

## Operations checklist (production)

- [ ] Managed Postgres with TLS required (`sslmode=require` in `DATABASE_URL`)
- [ ] PgBouncer or provider pooler; app pool `max ≤ 3` per serverless instance
- [ ] `JWT_SECRET` ≥ 32 random bytes (not `change-me`)
- [ ] Rotate Docker dev creds; never use `cangzhan:cangzhan` outside localhost
- [ ] Enable `pg_stat_statements` on production instance
- [ ] PITR backups + **monthly restore test** documented
- [ ] `statement_timeout` role for API user (e.g. 30s); longer role for migrations
- [ ] `idle_in_transaction_session_timeout = 60s`
- [ ] Vercel: run `db:migrate` + `db:seed` once against production URL before cutover

---

## AI self-check (migrations reviewed)

- [x] `IF NOT EXISTS` on CREATE TABLE
- [x] `timestamptz` on audit/commercial timestamps
- [x] Money as `NUMERIC(18,4)` not float
- [ ] `CREATE INDEX CONCURRENTLY` — **not used** (tables small now; required before prod scale)
- [ ] NOT NULL column adds — N/A in current files
- [x] No destructive DROP in existing migrations
- [ ] Idempotent runner — **partial** (SQL yes, runner no)
- [ ] FK indexes — **many missing**
- [x] Parameterized queries via Drizzle (no string concat in services reviewed)

---

## Conclusion table

| ID | Severity | Title | Effort |
|---|---|---|---|
| P0-1 | P0 | Migration ledger missing | S |
| P0-2 | P0 | Doc sequence race | S |
| P0-3 | P0 | Serverless connection pooling | M |
| P1-1 | P1 | Missing FK indexes | S |
| P1-2 | P1 | Status CHECK constraints | M |
| P1-3 | P1 | `customers.boxes` denorm | M |
| P1-4 | P1 | Explicit ON DELETE | S |
| P1-5 | P1 | Opportunity money type | S |
| P2 | P2 | Phase 4 containers/milestones | L |

**Overall:** Schema is **MVP-ready for demo/production pilot** after P0 fixes. Full freight ops needs Phase 4 tables + index pass.

---

## Related files

- Migrations: `server/db/migrations/0000_init_auth.sql` … `0002_commercial_workflow.sql`
- Drizzle schema: `server/db/schema/*.ts`
- Runner: `server/db/migrate.ts`
- Pool: `server/db/index.ts`
- Hot services: `server/services/rate.service.ts`, `finance.service.ts`, `operations.service.ts`, `sequence.service.ts`
