-- Customer service cases (เคส / 工单): tickets with SLA timers, a timeline of notes / replies /
-- changes, canned replies, and per-organization SLA targets by priority.

CREATE TABLE IF NOT EXISTS "cases" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_no" text NOT NULL,
  "customer_id" text REFERENCES "customers"("id") ON DELETE SET NULL,
  "contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL,
  "channel" text NOT NULL DEFAULT 'phone' CHECK ("channel" IN ('phone', 'email', 'line', 'walk_in', 'portal')),
  "category" text NOT NULL DEFAULT 'other' CHECK ("category" IN ('status_inquiry', 'documents', 'pricing', 'complaint', 'other')),
  "priority" text NOT NULL DEFAULT 'normal' CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
  "status" text NOT NULL DEFAULT 'new' CHECK ("status" IN ('new', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  "subject" text NOT NULL,
  "description" text,
  "assignee_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at" timestamp with time zone,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "job_id" text REFERENCES "jobs"("id") ON DELETE SET NULL,
  "container_no" text,
  "booking_id" text REFERENCES "bookings"("id") ON DELETE SET NULL,
  "source_mail_id" text,
  "first_response_due_at" timestamp with time zone,
  "resolve_due_at" timestamp with time zone,
  "first_responded_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cases_org_no_uq" ON "cases" ("organization_id", "case_no");
CREATE INDEX IF NOT EXISTS "cases_org_status_idx" ON "cases" ("organization_id", "status", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS "cases_org_assignee_idx" ON "cases" ("organization_id", "assignee_user_id", "status");
CREATE INDEX IF NOT EXISTS "cases_org_customer_idx" ON "cases" ("organization_id", "customer_id");
CREATE INDEX IF NOT EXISTS "cases_org_resolve_due_idx" ON "cases" ("organization_id", "resolve_due_at") WHERE "status" IN ('new', 'in_progress', 'waiting_customer');
CREATE INDEX IF NOT EXISTS "cases_org_job_idx" ON "cases" ("organization_id", "job_id");

CREATE TABLE IF NOT EXISTS "case_events" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "case_id" text NOT NULL REFERENCES "cases"("id") ON DELETE CASCADE,
  "type" text NOT NULL CHECK ("type" IN ('created', 'comment', 'reply', 'status', 'assignment', 'priority', 'category', 'link')),
  "body" text,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "mail_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "case_events_case_idx" ON "case_events" ("organization_id", "case_id", "created_at");

CREATE TABLE IF NOT EXISTS "canned_replies" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category" text CHECK ("category" IS NULL OR "category" IN ('status_inquiry', 'documents', 'pricing', 'complaint', 'other')),
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "canned_replies_org_idx" ON "canned_replies" ("organization_id", "sort_order");

-- SLA targets (minutes) per priority; missing rows fall back to the built-in defaults.
CREATE TABLE IF NOT EXISTS "case_sla_policies" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "priority" text NOT NULL CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
  "first_response_minutes" integer NOT NULL CHECK ("first_response_minutes" > 0),
  "resolve_minutes" integer NOT NULL CHECK ("resolve_minutes" > 0),
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "priority")
);
