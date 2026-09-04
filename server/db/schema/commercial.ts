import { boolean, integer, numeric, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customers } from "./crm.js";
import { organizations } from "./tenancy.js";

export const vendors = pgTable("vendors", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  company: text("company").notNull(),
  vendorType: text("vendor_type").notNull(),
  taxId: text("tax_id"),
  address: text("address"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  currencies: text("currencies").notNull().default("THB,USD,CNY"),
  services: text("services"),
  notes: text("notes"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateSheets = pgTable("rate_sheets", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendors.id),
  name: text("name").notNull(),
  carrier: text("carrier"),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLanes = pgTable("rate_lanes", {
  id: text("id").primaryKey(),
  rateSheetId: text("rate_sheet_id")
    .notNull()
    .references(() => rateSheets.id, { onDelete: "cascade" }),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  pol: text("pol").notNull(),
  pod: text("pod").notNull(),
  mode: text("mode").notNull(),
  containerType: text("container_type"),
  commodity: text("commodity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateCharges = pgTable("rate_charges", {
  id: text("id").primaryKey(),
  rateLaneId: text("rate_lane_id")
    .notNull()
    .references(() => rateLanes.id, { onDelete: "cascade" }),
  chargeCode: text("charge_code").notNull(),
  description: text("description").notNull(),
  side: text("side").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const docSequences = pgTable(
  "doc_sequences",
  {
    kind: text("kind").notNull(),
    year: integer("year").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.kind, t.year] })],
);

export const approvalRequests = pgTable("approval_requests", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  approverId: text("approver_id"),
  decision: text("decision"),
  comment: text("comment"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const quotations = pgTable("quotations", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  quotationNumber: text("quotation_number").notNull().unique(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  contactId: text("contact_id"),
  opportunityId: text("opportunity_id"),
  mode: text("mode").notNull(),
  serviceType: text("service_type").notNull().default("PORT_TO_PORT"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  pol: text("pol").notNull(),
  pod: text("pod").notNull(),
  incoterm: text("incoterm"),
  commodity: text("commodity"),
  containerType: text("container_type"),
  quantity: integer("quantity").notNull().default(1),
  weight: numeric("weight", { precision: 18, scale: 4 }),
  cbm: numeric("cbm", { precision: 18, scale: 4 }),
  currency: text("currency").notNull().default("THB"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  salesOwnerId: text("sales_owner_id"),
  status: text("status").notNull().default("DRAFT"),
  currentRevision: integer("current_revision").notNull().default(0),
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentBy: text("sent_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotationRevisions = pgTable("quotation_revisions", {
  id: text("id").primaryKey(),
  quotationId: text("quotation_id")
    .notNull()
    .references(() => quotations.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  snapshot: text("snapshot").notNull(),
  documentHash: text("document_hash"),
  reason: text("reason"),
  immutable: boolean("immutable").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quotationCharges = pgTable("quotation_charges", {
  id: text("id").primaryKey(),
  revisionId: text("revision_id")
    .notNull()
    .references(() => quotationRevisions.id, { onDelete: "cascade" }),
  chargeCode: text("charge_code").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  buyRate: numeric("buy_rate", { precision: 18, scale: 4 }).notNull(),
  sellRate: numeric("sell_rate", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).notNull().default("1"),
  buyAmount: numeric("buy_amount", { precision: 18, scale: 4 }).notNull(),
  sellAmount: numeric("sell_amount", { precision: 18, scale: 4 }).notNull(),
  margin: numeric("margin", { precision: 18, scale: 4 }).notNull(),
  marginPercentage: numeric("margin_percentage", { precision: 18, scale: 4 }).notNull(),
});

export const quoteAcceptanceTokens = pgTable("quote_acceptance_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  quotationId: text("quotation_id")
    .notNull()
    .references(() => quotations.id),
  revisionId: text("revision_id")
    .notNull()
    .references(() => quotationRevisions.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteSignatures = pgTable("quote_signatures", {
  id: text("id").primaryKey(),
  acceptanceEventId: text("acceptance_event_id").notNull().unique(),
  quotationId: text("quotation_id").notNull(),
  revisionId: text("revision_id").notNull(),
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email").notNull(),
  signerCompany: text("signer_company"),
  signerPosition: text("signer_position"),
  signatureMethod: text("signature_method").notNull(),
  acceptedTerms: boolean("accepted_terms").notNull(),
  consentText: text("consent_text").notNull(),
  documentHash: text("document_hash").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  decision: text("decision").notNull(),
});
