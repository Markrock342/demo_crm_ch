-- Commercial workflow: vendors, rates, quotations, operations, finance

CREATE TABLE IF NOT EXISTS "vendors" (
  "id" text PRIMARY KEY NOT NULL,
  "company" text NOT NULL,
  "vendor_type" text NOT NULL,
  "tax_id" text,
  "address" text,
  "payment_terms_days" integer DEFAULT 30 NOT NULL,
  "currencies" text DEFAULT 'THB,USD,CNY' NOT NULL,
  "services" text,
  "notes" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rate_sheets" (
  "id" text PRIMARY KEY NOT NULL,
  "vendor_id" text NOT NULL REFERENCES "vendors"("id"),
  "name" text NOT NULL,
  "carrier" text,
  "valid_from" timestamp with time zone NOT NULL,
  "valid_until" timestamp with time zone NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rate_lanes" (
  "id" text PRIMARY KEY NOT NULL,
  "rate_sheet_id" text NOT NULL REFERENCES "rate_sheets"("id") ON DELETE cascade,
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "pol" text NOT NULL,
  "pod" text NOT NULL,
  "mode" text NOT NULL,
  "container_type" text,
  "commodity" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rate_charges" (
  "id" text PRIMARY KEY NOT NULL,
  "rate_lane_id" text NOT NULL REFERENCES "rate_lanes"("id") ON DELETE cascade,
  "charge_code" text NOT NULL,
  "description" text NOT NULL,
  "side" text NOT NULL,
  "unit" text NOT NULL,
  "quantity" numeric(18,4) DEFAULT '1' NOT NULL,
  "unit_price" numeric(18,4) NOT NULL,
  "currency" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "doc_sequences" (
  "kind" text NOT NULL,
  "year" integer NOT NULL,
  "last_seq" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("kind", "year")
);

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "requested_by" text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approver_id" text,
  "decision" text,
  "comment" text,
  "decided_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "quotations" (
  "id" text PRIMARY KEY NOT NULL,
  "quotation_number" text NOT NULL UNIQUE,
  "customer_id" text NOT NULL REFERENCES "customers"("id"),
  "contact_id" text,
  "opportunity_id" text,
  "mode" text NOT NULL,
  "service_type" text DEFAULT 'PORT_TO_PORT' NOT NULL,
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "pol" text NOT NULL,
  "pod" text NOT NULL,
  "incoterm" text,
  "commodity" text,
  "container_type" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "weight" numeric(18,4),
  "cbm" numeric(18,4),
  "currency" text DEFAULT 'THB' NOT NULL,
  "valid_from" timestamp with time zone,
  "valid_until" timestamp with time zone,
  "payment_terms_days" integer DEFAULT 30 NOT NULL,
  "sales_owner_id" text,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "current_revision" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "terms_and_conditions" text,
  "sent_at" timestamp with time zone,
  "sent_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "quotation_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "quotation_id" text NOT NULL REFERENCES "quotations"("id") ON DELETE cascade,
  "revision_number" integer NOT NULL,
  "snapshot" text NOT NULL,
  "document_hash" text,
  "reason" text,
  "immutable" boolean DEFAULT false NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "quotation_charges" (
  "id" text PRIMARY KEY NOT NULL,
  "revision_id" text NOT NULL REFERENCES "quotation_revisions"("id") ON DELETE cascade,
  "charge_code" text NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "unit" text NOT NULL,
  "buy_rate" numeric(18,4) NOT NULL,
  "sell_rate" numeric(18,4) NOT NULL,
  "currency" text NOT NULL,
  "exchange_rate" numeric(18,8) DEFAULT '1' NOT NULL,
  "buy_amount" numeric(18,4) NOT NULL,
  "sell_amount" numeric(18,4) NOT NULL,
  "margin" numeric(18,4) NOT NULL,
  "margin_percentage" numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS "quote_acceptance_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "token" text NOT NULL UNIQUE,
  "quotation_id" text NOT NULL REFERENCES "quotations"("id"),
  "revision_id" text NOT NULL REFERENCES "quotation_revisions"("id"),
  "expires_at" timestamp with time zone NOT NULL,
  "revoked" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "quote_signatures" (
  "id" text PRIMARY KEY NOT NULL,
  "acceptance_event_id" text NOT NULL UNIQUE,
  "quotation_id" text NOT NULL,
  "revision_id" text NOT NULL,
  "signer_name" text NOT NULL,
  "signer_email" text NOT NULL,
  "signer_company" text,
  "signer_position" text,
  "signature_method" text NOT NULL,
  "accepted_terms" boolean NOT NULL,
  "consent_text" text NOT NULL,
  "document_hash" text NOT NULL,
  "signed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "decision" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_number" text NOT NULL UNIQUE,
  "customer_id" text NOT NULL REFERENCES "customers"("id"),
  "quotation_id" text REFERENCES "quotations"("id"),
  "quotation_revision_id" text REFERENCES "quotation_revisions"("id"),
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "pol" text NOT NULL,
  "pod" text NOT NULL,
  "mode" text NOT NULL,
  "carrier" text,
  "container_type" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "commodity" text,
  "weight" numeric(18,4),
  "cbm" numeric(18,4),
  "sales_owner_id" text,
  "status" text DEFAULT 'CONFIRMED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "job_number" text NOT NULL UNIQUE,
  "customer_id" text NOT NULL REFERENCES "customers"("id"),
  "booking_id" text REFERENCES "bookings"("id"),
  "quotation_id" text REFERENCES "quotations"("id"),
  "quotation_revision_id" text,
  "direction" text DEFAULT 'EXPORT' NOT NULL,
  "mode" text NOT NULL,
  "service_type" text DEFAULT 'PORT_TO_PORT' NOT NULL,
  "incoterm" text,
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "pol" text NOT NULL,
  "pod" text NOT NULL,
  "carrier" text,
  "booking_number" text,
  "master_bl" text,
  "house_bl" text,
  "vessel" text,
  "voyage" text,
  "etd" text,
  "eta" text,
  "commodity" text,
  "container_type" text,
  "container_count" integer DEFAULT 0 NOT NULL,
  "teu" integer DEFAULT 0 NOT NULL,
  "sales_owner_id" text,
  "assigned_operator" text,
  "status" text DEFAULT 'BOOKING' NOT NULL,
  "currency" text DEFAULT 'THB' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "shipment_charges" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
  "charge_code" text NOT NULL,
  "charge_type" text NOT NULL,
  "source" text NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "unit" text NOT NULL,
  "currency" text NOT NULL,
  "exchange_rate" numeric(18,8) DEFAULT '1' NOT NULL,
  "unit_amount" numeric(18,4) NOT NULL,
  "total_amount" numeric(18,4) NOT NULL,
  "quoted_amount" numeric(18,4),
  "actual_amount" numeric(18,4),
  "vendor_id" text REFERENCES "vendors"("id"),
  "customer_id" text REFERENCES "customers"("id"),
  "status" text DEFAULT 'OPEN' NOT NULL,
  "invoiced" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "currencies" (
  "code" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "symbol" text NOT NULL,
  "decimals" integer DEFAULT 2 NOT NULL
);

CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" text PRIMARY KEY NOT NULL,
  "from_currency" text NOT NULL,
  "to_currency" text NOT NULL,
  "rate" numeric(18,8) NOT NULL,
  "rate_date" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tax_codes" (
  "code" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "rate" numeric(8,4) NOT NULL,
  "type" text NOT NULL,
  "effective_from" timestamp with time zone NOT NULL,
  "effective_until" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" text PRIMARY KEY NOT NULL,
  "invoice_number" text NOT NULL UNIQUE,
  "customer_id" text NOT NULL REFERENCES "customers"("id"),
  "job_id" text REFERENCES "jobs"("id"),
  "issue_date" timestamp with time zone NOT NULL,
  "due_date" timestamp with time zone NOT NULL,
  "currency" text NOT NULL,
  "exchange_rate" numeric(18,8) DEFAULT '1' NOT NULL,
  "subtotal" numeric(18,4) NOT NULL,
  "tax" numeric(18,4) DEFAULT '0' NOT NULL,
  "total" numeric(18,4) NOT NULL,
  "paid_amount" numeric(18,4) DEFAULT '0' NOT NULL,
  "balance_due" numeric(18,4) NOT NULL,
  "payment_terms_days" integer DEFAULT 30 NOT NULL,
  "billing_address" text,
  "notes" text,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "created_by" text,
  "issued_by" text,
  "issued_at" timestamp with time zone,
  "snapshot" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invoice_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "invoice_id" text NOT NULL REFERENCES "invoices"("id") ON DELETE cascade,
  "charge_id" text,
  "description" text NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "unit_amount" numeric(18,4) NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "currency" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "billing_notes" (
  "id" text PRIMARY KEY NOT NULL,
  "billing_number" text NOT NULL UNIQUE,
  "customer_id" text NOT NULL REFERENCES "customers"("id"),
  "billing_date" timestamp with time zone NOT NULL,
  "scheduled_payment_date" timestamp with time zone,
  "currency" text NOT NULL,
  "subtotal" numeric(18,4) NOT NULL,
  "grand_total" numeric(18,4) NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "billing_contact" text,
  "billing_address" text,
  "snapshot" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "billing_note_items" (
  "id" text PRIMARY KEY NOT NULL,
  "billing_note_id" text NOT NULL REFERENCES "billing_notes"("id") ON DELETE cascade,
  "invoice_id" text NOT NULL REFERENCES "invoices"("id"),
  "amount" numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" text PRIMARY KEY NOT NULL,
  "payment_number" text NOT NULL UNIQUE,
  "customer_id" text NOT NULL REFERENCES "customers"("id"),
  "payment_date" timestamp with time zone NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "currency" text NOT NULL,
  "method" text NOT NULL,
  "reference" text,
  "bank_reference" text,
  "status" text DEFAULT 'RECORDED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payment_allocations" (
  "id" text PRIMARY KEY NOT NULL,
  "payment_id" text NOT NULL REFERENCES "payments"("id") ON DELETE cascade,
  "invoice_id" text NOT NULL REFERENCES "invoices"("id"),
  "amount" numeric(18,4) NOT NULL
);

CREATE TABLE IF NOT EXISTS "vendor_bills" (
  "id" text PRIMARY KEY NOT NULL,
  "vendor_id" text NOT NULL REFERENCES "vendors"("id"),
  "job_id" text REFERENCES "jobs"("id"),
  "bill_number" text NOT NULL,
  "bill_date" timestamp with time zone NOT NULL,
  "due_date" timestamp with time zone NOT NULL,
  "currency" text NOT NULL,
  "subtotal" numeric(18,4) NOT NULL,
  "tax" numeric(18,4) DEFAULT '0' NOT NULL,
  "total" numeric(18,4) NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "vendor_bill_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "vendor_bill_id" text NOT NULL REFERENCES "vendor_bills"("id") ON DELETE cascade,
  "charge_id" text,
  "description" text NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "currency" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "approval_config" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL
);

INSERT INTO "approval_config" ("key", "value") VALUES ('min_margin_pct', '10') ON CONFLICT DO NOTHING;
INSERT INTO "approval_config" ("key", "value") VALUES ('max_value_without_approval', '500000') ON CONFLICT DO NOTHING;

INSERT INTO "currencies" ("code", "name", "symbol", "decimals") VALUES
  ('THB', 'Thai Baht', '฿', 2),
  ('USD', 'US Dollar', '$', 2),
  ('CNY', 'Chinese Yuan', '¥', 2),
  ('EUR', 'Euro', '€', 2)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS "rate_lanes_search_idx" ON "rate_lanes" ("origin", "destination", "container_type");
CREATE INDEX IF NOT EXISTS "quotations_customer_idx" ON "quotations" ("customer_id", "status");
CREATE INDEX IF NOT EXISTS "jobs_customer_idx" ON "jobs" ("customer_id");
CREATE INDEX IF NOT EXISTS "invoices_customer_status_idx" ON "invoices" ("customer_id", "status");
