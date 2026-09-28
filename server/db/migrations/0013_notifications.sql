-- Server-side automation rules, per-user notifications, and notification channels (LINE).

CREATE TABLE IF NOT EXISTS "automation_rules" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "channels" jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_run_at" timestamp with time zone,
  "last_result" jsonb,
  "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "key")
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ref_type" text,
  "ref_id" text,
  "href" text,
  "dedupe_key" text NOT NULL,
  "read_at" timestamp with time zone,
  "line_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_uq" ON "notifications" ("organization_id", "user_id", "dedupe_key");
CREATE INDEX IF NOT EXISTS "notifications_user_feed_idx" ON "notifications" ("organization_id", "user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx" ON "notifications" ("organization_id", "user_id") WHERE "read_at" IS NULL;

CREATE TABLE IF NOT EXISTS "notification_channels" (
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "address" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "link_code" text,
  "link_code_expires_at" timestamp with time zone,
  "linked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "user_id", "channel")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_channels_code_uq" ON "notification_channels" ("link_code") WHERE "link_code" IS NOT NULL;
