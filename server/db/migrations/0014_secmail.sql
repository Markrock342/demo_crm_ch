-- Real outbound e-mail, staff login lockout, organization-scoped audit log.

-- ---------------------------------------------------------------------------
-- Staff login brute-force guard (shared across serverless instances).
-- key = lower(email) || '|' || client IP
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "key" text PRIMARY KEY,
  "email" text NOT NULL DEFAULT '',
  "ip" text NOT NULL DEFAULT '',
  "failures" integer NOT NULL DEFAULT 0,
  "window_started_at" timestamptz NOT NULL DEFAULT now(),
  "locked_until" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "login_attempts_updated_idx" ON "login_attempts" ("updated_at");

-- ---------------------------------------------------------------------------
-- Outbound mail stored in the same "mails" table as the inbox.
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "direction" text NOT NULL DEFAULT 'in';
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "to_addr" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "cc_addr" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "delivery_status" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "delivery_error" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "transport" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "message_id" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "sent_at" timestamptz;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "sent_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "entity_type" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "entity_id" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "in_reply_to" text;
ALTER TABLE "mails" ADD COLUMN IF NOT EXISTS "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS "mails_org_direction_idx" ON "mails" ("organization_id", "direction", "created_at");
CREATE INDEX IF NOT EXISTS "mails_entity_idx" ON "mails" ("entity_type", "entity_id");

-- ---------------------------------------------------------------------------
-- Audit log: which organization an entry belongs to (older rows fall back to
-- the acting user's memberships).
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "audit_logs_org_created_idx" ON "audit_logs" ("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_user_created_idx" ON "audit_logs" ("user_id", "created_at");
