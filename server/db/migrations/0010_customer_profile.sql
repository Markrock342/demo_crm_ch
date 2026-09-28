-- Full customer record: company info, tax & billing, shipping profile, richer contacts.
-- Every new column is nullable (or defaulted) so existing rows stay valid.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "name_langs" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_type" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "website" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "industry" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "lead_source" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "notes" text;

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tax_id" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "branch_no" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "billing_address" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "country" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "currency" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_term_days" integer;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "credit_limit" numeric(18, 2);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "payment_method" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "billing_email" text;

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "preferred_lanes" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "container_types" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "commodities" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "incoterms" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customs_broker" boolean;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "handling_notes" text;

CREATE INDEX IF NOT EXISTS "customers_org_idx" ON "customers" ("organization_id");
CREATE INDEX IF NOT EXISTS "customers_owner_user_idx" ON "customers" ("owner_user_id");

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "line_id" text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "contacts_customer_idx" ON "contacts" ("customer_id");
