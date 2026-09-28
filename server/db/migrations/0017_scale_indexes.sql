-- 0017: indexes for server-side list filters / sorting at "years of data" scale (indexes only).
-- Jobs list: org + recent first; enrichment joins invoices by job.
CREATE INDEX IF NOT EXISTS "jobs_org_updated_idx" ON "jobs" ("organization_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "jobs_org_status_idx" ON "jobs" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "invoices_job_idx" ON "invoices" ("job_id");
-- Open (not yet done) milestones: next step + at-risk scans.
CREATE INDEX IF NOT EXISTS "job_milestones_open_idx" ON "job_milestones" ("job_id", "sort_order") WHERE "actual_at" IS NULL;
CREATE INDEX IF NOT EXISTS "job_milestones_open_planned_idx" ON "job_milestones" ("planned_at") WHERE "actual_at" IS NULL;
-- Invoices list: newest first, tabs by status / due date, per customer.
CREATE INDEX IF NOT EXISTS "invoices_org_issue_idx" ON "invoices" ("organization_id", "issue_date" DESC);
CREATE INDEX IF NOT EXISTS "invoices_org_status_due_idx" ON "invoices" ("organization_id", "status", "due_date");
CREATE INDEX IF NOT EXISTS "invoices_org_customer_idx" ON "invoices" ("organization_id", "customer_id");
-- Customers / containers lists: recent first, status tabs.
CREATE INDEX IF NOT EXISTS "customers_org_updated_idx" ON "customers" ("organization_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "containers_org_updated_idx" ON "containers" ("organization_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "containers_org_status_idx" ON "containers" ("organization_id", "status");
-- Audit trail screens (org feed, newest first).
CREATE INDEX IF NOT EXISTS "audit_logs_org_created_idx" ON "audit_logs" ("organization_id", "created_at" DESC);
