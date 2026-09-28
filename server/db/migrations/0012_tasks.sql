-- Org-wide to-dos (สิ่งที่ต้องทำ) and the activity log (calls / mails / meetings / notes)
-- on customers and jobs. Job checklists stay in job_tasks (0008).

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "notes" text,
  "due_at" timestamp with time zone,
  "priority" text NOT NULL DEFAULT 'mid' CHECK ("priority" IN ('high', 'mid', 'low')),
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'done')),
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "customer_id" text REFERENCES "customers"("id") ON DELETE SET NULL,
  "job_id" text REFERENCES "jobs"("id") ON DELETE SET NULL,
  "container_no" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tasks_org_status_due_idx" ON "tasks" ("organization_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "tasks_org_owner_idx" ON "tasks" ("organization_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "tasks_org_customer_idx" ON "tasks" ("organization_id", "customer_id");
CREATE INDEX IF NOT EXISTS "tasks_org_job_idx" ON "tasks" ("organization_id", "job_id");

CREATE TABLE IF NOT EXISTS "activities" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "type" text NOT NULL CHECK ("type" IN ('call', 'mail', 'meet', 'note', 'task')),
  "body" text NOT NULL,
  "customer_id" text REFERENCES "customers"("id") ON DELETE CASCADE,
  "job_id" text REFERENCES "jobs"("id") ON DELETE CASCADE,
  "task_id" text REFERENCES "tasks"("id") ON DELETE SET NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "activities_org_customer_idx" ON "activities" ("organization_id", "customer_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "activities_org_job_idx" ON "activities" ("organization_id", "job_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "activities_org_time_idx" ON "activities" ("organization_id", "occurred_at");
