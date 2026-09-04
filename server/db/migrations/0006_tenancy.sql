-- Multi-tenant foundation: organizations + organization_id on business tables

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "organization_members" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "org_role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "user_id")
);

INSERT INTO "organizations" ("id", "slug", "name", "timezone")
VALUES ('11111111-1111-4111-8111-111111111111', 'cangzhan-demo', 'CANGZHAN Demo', 'Asia/Bangkok')
ON CONFLICT ("id") DO NOTHING;

-- Tenant columns (nullable → backfill → NOT NULL)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "quotations" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "containers" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "crm_docs" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");

UPDATE "customers" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "leads" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "jobs" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "quotations" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "invoices" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "containers" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "mails" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "crm_docs" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;
UPDATE "vendors" SET "organization_id" = '11111111-1111-4111-8111-111111111111' WHERE "organization_id" IS NULL;

ALTER TABLE "customers" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "jobs" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "quotations" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "containers" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "mails" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "crm_docs" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "vendors" ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "customers_org_idx" ON "customers" ("organization_id");
CREATE INDEX IF NOT EXISTS "jobs_org_idx" ON "jobs" ("organization_id");
CREATE INDEX IF NOT EXISTS "quotations_org_idx" ON "quotations" ("organization_id");
CREATE INDEX IF NOT EXISTS "invoices_org_idx" ON "invoices" ("organization_id");
CREATE INDEX IF NOT EXISTS "containers_org_idx" ON "containers" ("organization_id");

-- Link existing demo users to demo org (idempotent)
INSERT INTO "organization_members" ("organization_id", "user_id", "org_role")
SELECT '11111111-1111-4111-8111-111111111111', u."id", 'owner'
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "organization_members" m
  WHERE m."organization_id" = '11111111-1111-4111-8111-111111111111' AND m."user_id" = u."id"
);
