-- Ops hardening: FK indexes, status checks, containers + milestones

CREATE INDEX IF NOT EXISTS "idx_rate_sheets_vendor" ON "rate_sheets" ("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_rate_charges_lane" ON "rate_charges" ("rate_lane_id");
CREATE INDEX IF NOT EXISTS "idx_quotation_revisions_quote" ON "quotation_revisions" ("quotation_id");
CREATE INDEX IF NOT EXISTS "idx_quotation_charges_revision" ON "quotation_charges" ("revision_id");
CREATE INDEX IF NOT EXISTS "idx_quote_tokens_quote" ON "quote_acceptance_tokens" ("quotation_id");
CREATE INDEX IF NOT EXISTS "idx_bookings_quotation" ON "bookings" ("quotation_id");
CREATE INDEX IF NOT EXISTS "idx_bookings_customer" ON "bookings" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_jobs_booking" ON "jobs" ("booking_id");
CREATE INDEX IF NOT EXISTS "idx_jobs_quotation" ON "jobs" ("quotation_id");
CREATE INDEX IF NOT EXISTS "idx_jobs_customer_created" ON "jobs" ("customer_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_shipment_charges_job" ON "shipment_charges" ("job_id");
CREATE INDEX IF NOT EXISTS "idx_invoice_lines_invoice" ON "invoice_lines" ("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_billing_note_items_bn" ON "billing_note_items" ("billing_note_id");
CREATE INDEX IF NOT EXISTS "idx_payment_allocations_payment" ON "payment_allocations" ("payment_id");
CREATE INDEX IF NOT EXISTS "idx_payment_allocations_invoice" ON "payment_allocations" ("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_bills_vendor" ON "vendor_bills" ("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_bills_job" ON "vendor_bills" ("job_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_status_open" ON "invoices" ("status") WHERE "status" IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID');

ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_status_chk";
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_status_chk"
  CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'));

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_status_chk";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_status_chk"
  CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'CANCELLED'));

ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_status_chk";
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_status_chk"
  CHECK ("status" IN ('BOOKING', 'GATE_IN', 'SAIL', 'ARRIVED', 'DELIVERED', 'CLOSED'));

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_status_chk";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_chk"
  CHECK ("status" IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'));

ALTER TABLE "billing_notes" DROP CONSTRAINT IF EXISTS "billing_notes_status_chk";
ALTER TABLE "billing_notes" ADD CONSTRAINT "billing_notes_status_chk"
  CHECK ("status" IN ('DRAFT', 'ISSUED', 'VOID'));

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_status_chk";
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_chk"
  CHECK ("status" IN ('RECORDED', 'VOID'));

ALTER TABLE "vendors" DROP CONSTRAINT IF EXISTS "vendors_status_chk";
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_status_chk"
  CHECK ("status" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "shipment_charges" DROP CONSTRAINT IF EXISTS "shipment_charges_status_chk";
ALTER TABLE "shipment_charges" ADD CONSTRAINT "shipment_charges_status_chk"
  CHECK ("status" IN ('OPEN', 'INVOICED', 'CLOSED'));

ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_stage_chk";
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_chk"
  CHECK ("stage" IN ('new', 'working', 'qualified', 'lost'));

ALTER TABLE "opportunities" DROP CONSTRAINT IF EXISTS "opportunities_stage_chk";
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_chk"
  CHECK ("stage" IN ('qualify', 'quote', 'book', 'won', 'billed', 'lost'));

CREATE TABLE IF NOT EXISTS "containers" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text REFERENCES "jobs"("id") ON DELETE SET NULL,
  "customer_id" text NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "container_no" text NOT NULL UNIQUE,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'yard',
  "direction" text NOT NULL,
  "bl" text,
  "pol" text,
  "pod" text,
  "teu" integer DEFAULT 1 NOT NULL,
  "eta" date,
  "yard_code" text,
  "vessel" text,
  "seal" text,
  "commodity" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "containers" DROP CONSTRAINT IF EXISTS "containers_status_chk";
ALTER TABLE "containers" ADD CONSTRAINT "containers_status_chk"
  CHECK ("status" IN ('yard', 'sail', 'clear', 'hold', 'empty'));

ALTER TABLE "containers" DROP CONSTRAINT IF EXISTS "containers_direction_chk";
ALTER TABLE "containers" ADD CONSTRAINT "containers_direction_chk"
  CHECK ("direction" IN ('in', 'out'));

CREATE INDEX IF NOT EXISTS "idx_containers_customer" ON "containers" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_containers_job" ON "containers" ("job_id");
CREATE INDEX IF NOT EXISTS "idx_containers_status" ON "containers" ("status");

CREATE TABLE IF NOT EXISTS "job_milestones" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "planned_at" timestamp with time zone,
  "actual_at" timestamp with time zone,
  "sort_order" integer DEFAULT 0 NOT NULL,
  UNIQUE ("job_id", "code")
);

CREATE INDEX IF NOT EXISTS "idx_milestones_job" ON "job_milestones" ("job_id", "sort_order");
