-- Business units (ธุรกิจในเครือ: port, empty depot, barge, CFS, trucking …) on cases and customers,
-- and a LINE inbox: several company LINE Official Accounts whose customer chats open / continue
-- cases, with replies pushed back to the same LINE chat.

CREATE TABLE IF NOT EXISTS "business_units" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "business_units_org_idx" ON "business_units" ("organization_id", "sort_order");

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_units" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- One row per company LINE OA. Secret / token are encrypted (lib/secret-box) and never sent to the browser.
CREATE TABLE IF NOT EXISTS "line_channels" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "basic_id" text,
  "bot_user_id" text,
  "channel_secret_enc" text,
  "access_token_enc" text,
  "token_hint" text,
  "webhook_key" text NOT NULL,
  "business_unit_id" text REFERENCES "business_units"("id") ON DELETE SET NULL,
  -- Instant LINE reply when a chat opens a case ({case} = case number); free (reply API), null = off.
  "ack_message" text,
  "active" boolean NOT NULL DEFAULT true,
  "last_event_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "line_channels_webhook_key_uq" ON "line_channels" ("webhook_key");
CREATE INDEX IF NOT EXISTS "line_channels_org_idx" ON "line_channels" ("organization_id");

-- A customer's LINE account as seen by one OA (LINE user ids differ per provider).
CREATE TABLE IF NOT EXISTS "line_contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "channel_id" text NOT NULL REFERENCES "line_channels"("id") ON DELETE CASCADE,
  "line_user_id" text NOT NULL,
  "display_name" text,
  "picture_url" text,
  "customer_id" text REFERENCES "customers"("id") ON DELETE SET NULL,
  "contact_id" text REFERENCES "contacts"("id") ON DELETE SET NULL,
  "followed" boolean NOT NULL DEFAULT true,
  "last_message_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "line_contacts_channel_user_uq" ON "line_contacts" ("channel_id", "line_user_id");
CREATE INDEX IF NOT EXISTS "line_contacts_org_customer_idx" ON "line_contacts" ("organization_id", "customer_id");

ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "business_unit_id" text REFERENCES "business_units"("id") ON DELETE SET NULL;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "line_contact_id" text REFERENCES "line_contacts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "cases_org_unit_idx" ON "cases" ("organization_id", "business_unit_id", "status");
CREATE INDEX IF NOT EXISTS "cases_line_contact_idx" ON "cases" ("line_contact_id", "status");

-- "inbound" = a message from the customer (LINE today); data.lineMessageId de-duplicates webhook retries.
ALTER TABLE "case_events" DROP CONSTRAINT IF EXISTS "case_events_type_check";
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_type_check"
  CHECK ("type" IN ('created', 'comment', 'reply', 'status', 'assignment', 'priority', 'category', 'link', 'inbound'));
CREATE UNIQUE INDEX IF NOT EXISTS "case_events_line_msg_uq" ON "case_events" ("organization_id", (("data" ->> 'lineMessageId')))
  WHERE "data" ? 'lineMessageId';
