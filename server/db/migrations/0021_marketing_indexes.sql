-- 0021: indexes for marketing analytics date-range aggregates (indexes only, idempotent).
CREATE INDEX IF NOT EXISTS "leads_org_created_idx" ON "leads" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "customers_org_created_idx" ON "customers" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "quotations_org_sent_idx" ON "quotations" ("organization_id", "sent_at");
CREATE INDEX IF NOT EXISTS "quotations_org_created_idx" ON "quotations" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "jobs_org_created_idx" ON "jobs" ("organization_id", "created_at");
