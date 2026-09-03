-- 0004: AP vendor bill hardening + drop denormalized customers.boxes

ALTER TABLE shipment_charges
  ADD COLUMN IF NOT EXISTS billed boolean NOT NULL DEFAULT false;

ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_bills_bill_number_uidx ON vendor_bills (bill_number);

CREATE INDEX IF NOT EXISTS idx_shipment_charges_billed ON shipment_charges (job_id, billed)
  WHERE billed = false;

-- containers is source of truth for box counts
ALTER TABLE customers DROP COLUMN IF EXISTS boxes;
