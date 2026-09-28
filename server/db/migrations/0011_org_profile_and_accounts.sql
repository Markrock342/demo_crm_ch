-- Admin essentials: company profile per organization, password-change tracking.

-- Sessions (JWT) issued before this instant are rejected, so changing / resetting a
-- password signs out every other device.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamptz;

CREATE TABLE IF NOT EXISTS "organization_profiles" (
  "organization_id" uuid PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name_en" text NOT NULL DEFAULT '',
  "name_th" text,
  "name_zh" text,
  "tax_id" text,
  "branch_type" text NOT NULL DEFAULT 'head_office',
  "branch_code" text,
  "address_en" text,
  "address_th" text,
  "address_zh" text,
  "phone" text,
  "email" text,
  "website" text,
  "logo_key" text,
  "logo_mime" text,
  "bank_name" text,
  "bank_branch" text,
  "bank_account_name" text,
  "bank_account_no" text,
  "bank_swift" text,
  "default_currency" text NOT NULL DEFAULT 'THB',
  "invoice_footer" text,
  "quotation_footer" text,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Keep today's PDF header for the existing company so nothing changes until an admin edits it.
INSERT INTO "organization_profiles" ("organization_id", "name_en", "name_zh", "tax_id", "address_en")
SELECT o."id",
       CASE WHEN o."id" = '11111111-1111-4111-8111-111111111111' THEN 'CANGZHAN Freight Forwarding Co., Ltd.' ELSE o."name" END,
       CASE WHEN o."id" = '11111111-1111-4111-8111-111111111111' THEN '沧栈国际货运代理有限公司' ELSE NULL END,
       CASE WHEN o."id" = '11111111-1111-4111-8111-111111111111' THEN '0105559999999' ELSE NULL END,
       CASE WHEN o."id" = '11111111-1111-4111-8111-111111111111' THEN 'Laem Chabang Port Logistics Park, Chonburi, Thailand' ELSE NULL END
  FROM "organizations" o
ON CONFLICT ("organization_id") DO NOTHING;
