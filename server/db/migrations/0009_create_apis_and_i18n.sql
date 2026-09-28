-- Create-from-scratch finance docs, multilingual people/vendor names, vendor contacts.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name_th" text;

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "name_zh" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "name_th" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_name" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_email" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "contact_phone" text;

-- Vendor bills may now exist without a job, so they carry their own tenant.
ALTER TABLE "vendor_bills" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id");
UPDATE "vendor_bills" vb
   SET "organization_id" = j."organization_id"
  FROM "jobs" j
 WHERE vb."job_id" = j."id" AND vb."organization_id" IS NULL;
CREATE INDEX IF NOT EXISTS "vendor_bills_org_idx" ON "vendor_bills" ("organization_id");

ALTER TABLE "vendor_bill_lines" ADD COLUMN IF NOT EXISTS "quantity" numeric(18, 4);
ALTER TABLE "vendor_bill_lines" ADD COLUMN IF NOT EXISTS "unit_amount" numeric(18, 4);
ALTER TABLE "vendor_bill_lines" ADD COLUMN IF NOT EXISTS "tax_code" text;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "tax_code" text;

INSERT INTO "tax_codes" ("code", "name", "rate", "type", "effective_from")
VALUES ('VAT7', 'VAT 7%', 0.07, 'VAT', '2020-01-01'),
       ('VAT0', 'VAT 0% (export)', 0, 'VAT', '2020-01-01'),
       ('EXEMPT', 'Not subject to VAT', 0, 'VAT', '2020-01-01')
ON CONFLICT ("code") DO NOTHING;
