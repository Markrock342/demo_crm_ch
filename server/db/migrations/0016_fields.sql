-- Round 3 data gaps: bookings served from the DB (carrier booking fields, voyage stage, cut-offs),
-- cut-offs on jobs, last free day on containers, deal currency, real owners on leads / deals.
-- Idempotent: every change is IF NOT EXISTS / guarded.

-- Bookings ---------------------------------------------------------------
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "carrier_booking_no" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "vessel" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "voyage" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "bl" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "etd" date;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "eta" date;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "teu" integer DEFAULT 0 NOT NULL;
-- Voyage stage (booking → gate-in → sailed → arrived → delivered); "status" stays the booking lifecycle.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "stage" text DEFAULT 'booking' NOT NULL;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "si_cutoff" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cy_cutoff" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "vgm_cutoff" timestamp with time zone;

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_stage_chk";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_stage_chk"
  CHECK ("stage" IN ('booking', 'gate_in', 'sail', 'arrived', 'delivered'));

-- Existing bookings: take voyage details from the job made from them.
UPDATE "bookings" b SET
  "vessel" = COALESCE(b."vessel", j."vessel"),
  "voyage" = COALESCE(b."voyage", j."voyage"),
  "bl" = COALESCE(b."bl", j."master_bl"),
  "carrier" = COALESCE(b."carrier", j."carrier"),
  "teu" = CASE WHEN b."teu" = 0 THEN j."teu" ELSE b."teu" END
FROM "jobs" j
WHERE j."booking_id" = b."id";
UPDATE "bookings" SET "teu" = "quantity" * (CASE WHEN COALESCE("container_type", '') LIKE '20%' THEN 1 ELSE 2 END)
WHERE "teu" = 0;

CREATE INDEX IF NOT EXISTS "idx_bookings_stage" ON "bookings" ("stage");

-- Jobs: cut-offs ---------------------------------------------------------
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "si_cutoff" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "cy_cutoff" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "vgm_cutoff" timestamp with time zone;

-- Containers: real free time --------------------------------------------
ALTER TABLE "containers" ADD COLUMN IF NOT EXISTS "last_free_day" date;
ALTER TABLE "containers" ADD COLUMN IF NOT EXISTS "free_days" integer;
ALTER TABLE "containers" DROP CONSTRAINT IF EXISTS "containers_free_days_chk";
ALTER TABLE "containers" ADD CONSTRAINT "containers_free_days_chk" CHECK ("free_days" IS NULL OR ("free_days" >= 0 AND "free_days" <= 365));

-- Deals: currency + owner ------------------------------------------------
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'THB' NOT NULL;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_opportunities_customer" ON "opportunities" ("customer_id");

-- Leads: owner -----------------------------------------------------------
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

-- Map legacy owner names (any language) to staff users.
UPDATE "leads" l SET "owner_user_id" = u."id"
FROM "users" u
WHERE l."owner_user_id" IS NULL AND l."owner" <> '' AND l."owner" IN (u."name", u."name_zh", u."name_th");
UPDATE "opportunities" o SET "owner_user_id" = u."id"
FROM "users" u
WHERE o."owner_user_id" IS NULL AND o."owner" <> '' AND o."owner" IN (u."name", u."name_zh", u."name_th");
