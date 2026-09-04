-- Portal access + document object storage metadata

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "portal_pin" text DEFAULT 'demo';
UPDATE "customers" SET "portal_pin" = 'demo' WHERE "portal_pin" IS NULL;

ALTER TABLE "crm_docs" ADD COLUMN IF NOT EXISTS "storage_key" text;
ALTER TABLE "crm_docs" ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE "crm_docs" ADD COLUMN IF NOT EXISTS "size_bytes" bigint;
ALTER TABLE "crm_docs" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "document_templates" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "template_json" jsonb NOT NULL DEFAULT '{}',
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE ("organization_id", "code")
);

INSERT INTO "document_templates" ("id", "organization_id", "code", "name", "template_json")
VALUES (
  'tpl-quotation-v1',
  '11111111-1111-4111-8111-111111111111',
  'QUOTATION',
  'Standard Quotation',
  '{"schemas":[[{"name":"title","type":"text","position":{"x":20,"y":20},"width":170,"height":10}]],"basePdf":{"width":210,"height":297,"padding":[20,20,20,20]}}'
)
ON CONFLICT ("id") DO NOTHING;
