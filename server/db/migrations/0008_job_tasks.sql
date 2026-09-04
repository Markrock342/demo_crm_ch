-- Job-scoped tasks (production CRM ops)

CREATE TABLE IF NOT EXISTS "job_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "due_at" timestamp with time zone,
  "owner" text NOT NULL DEFAULT '',
  "priority" text NOT NULL DEFAULT 'mid',
  "done" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "job_tasks_org_job_idx" ON "job_tasks" ("organization_id", "job_id");
