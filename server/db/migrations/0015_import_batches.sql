-- Excel / CSV import history: one row per uploaded batch, with the ids it created so it can be undone.

CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "entity" text NOT NULL,
  "file_name" text NOT NULL DEFAULT '',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "row_count" integer NOT NULL DEFAULT 0,
  "created_count" integer NOT NULL DEFAULT 0,
  "duplicate_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "undone_at" timestamp with time zone,
  "undone_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "import_batches_org_created_idx" ON "import_batches" ("organization_id", "created_at" DESC);
