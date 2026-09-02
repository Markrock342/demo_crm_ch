CREATE TABLE IF NOT EXISTS "customers" (
  "id" text PRIMARY KEY NOT NULL,
  "name_zh" text NOT NULL,
  "name_th" text NOT NULL,
  "name_en" text NOT NULL,
  "city_zh" text NOT NULL,
  "city_th" text NOT NULL,
  "city_en" text NOT NULL,
  "lane_zh" text NOT NULL,
  "lane_th" text NOT NULL,
  "lane_en" text NOT NULL,
  "boxes" integer DEFAULT 0 NOT NULL,
  "owner" text NOT NULL,
  "updated" text NOT NULL,
  "ar_days" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "customer_id" text NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "wechat" text DEFAULT '' NOT NULL,
  "primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "contacts_customer_idx" ON "contacts" ("customer_id");

CREATE TABLE IF NOT EXISTS "leads" (
  "id" text PRIMARY KEY NOT NULL,
  "company" text NOT NULL,
  "city" text NOT NULL,
  "lane" text NOT NULL,
  "contact" text NOT NULL,
  "source" text NOT NULL,
  "stage" text NOT NULL,
  "teu" integer DEFAULT 0 NOT NULL,
  "owner" text NOT NULL,
  "updated" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "opportunities" (
  "id" text PRIMARY KEY NOT NULL,
  "customer_id" text NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "lane" text NOT NULL,
  "stage" text NOT NULL,
  "value" integer DEFAULT 0 NOT NULL,
  "teu" integer DEFAULT 0 NOT NULL,
  "close" text NOT NULL,
  "owner" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "opportunities_customer_idx" ON "opportunities" ("customer_id");
CREATE INDEX IF NOT EXISTS "opportunities_stage_idx" ON "opportunities" ("stage");
