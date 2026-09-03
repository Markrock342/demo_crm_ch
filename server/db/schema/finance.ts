import { integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./crm.js";
import { jobs } from "./operations.js";
import { vendors } from "./commercial.js";

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimals: integer("decimals").notNull().default(2),
});

export const exchangeRates = pgTable("exchange_rates", {
  id: text("id").primaryKey(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
  rateDate: timestamp("rate_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxCodes = pgTable("tax_codes", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 8, scale: 4 }).notNull(),
  type: text("type").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  jobId: text("job_id").references(() => jobs.id),
  issueDate: timestamp("issue_date", { withTimezone: true }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  currency: text("currency").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).notNull().default("1"),
  subtotal: numeric("subtotal", { precision: 18, scale: 4 }).notNull(),
  tax: numeric("tax", { precision: 18, scale: 4 }).notNull().default("0"),
  total: numeric("total", { precision: 18, scale: 4 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 18, scale: 4 }).notNull().default("0"),
  balanceDue: numeric("balance_due", { precision: 18, scale: 4 }).notNull(),
  paymentTermsDays: integer("payment_terms_days").notNull().default(30),
  billingAddress: text("billing_address"),
  notes: text("notes"),
  status: text("status").notNull().default("DRAFT"),
  createdBy: text("created_by"),
  issuedBy: text("issued_by"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  snapshot: text("snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceLines = pgTable("invoice_lines", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  chargeId: text("charge_id"),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unitAmount: numeric("unit_amount", { precision: 18, scale: 4 }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
});

export const billingNotes = pgTable("billing_notes", {
  id: text("id").primaryKey(),
  billingNumber: text("billing_number").notNull().unique(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  billingDate: timestamp("billing_date", { withTimezone: true }).notNull(),
  scheduledPaymentDate: timestamp("scheduled_payment_date", { withTimezone: true }),
  currency: text("currency").notNull(),
  subtotal: numeric("subtotal", { precision: 18, scale: 4 }).notNull(),
  grandTotal: numeric("grand_total", { precision: 18, scale: 4 }).notNull(),
  status: text("status").notNull().default("DRAFT"),
  billingContact: text("billing_contact"),
  billingAddress: text("billing_address"),
  snapshot: text("snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingNoteItems = pgTable("billing_note_items", {
  id: text("id").primaryKey(),
  billingNoteId: text("billing_note_id")
    .notNull()
    .references(() => billingNotes.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
});

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  paymentNumber: text("payment_number").notNull().unique(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  paymentDate: timestamp("payment_date", { withTimezone: true }).notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
  method: text("method").notNull(),
  reference: text("reference"),
  bankReference: text("bank_reference"),
  status: text("status").notNull().default("RECORDED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentAllocations = pgTable("payment_allocations", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => payments.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
});

export const vendorBills = pgTable("vendor_bills", {
  id: text("id").primaryKey(),
  vendorId: text("vendor_id")
    .notNull()
    .references(() => vendors.id),
  jobId: text("job_id").references(() => jobs.id),
  billNumber: text("bill_number").notNull().unique(),
  billDate: timestamp("bill_date", { withTimezone: true }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  currency: text("currency").notNull(),
  subtotal: numeric("subtotal", { precision: 18, scale: 4 }).notNull(),
  tax: numeric("tax", { precision: 18, scale: 4 }).notNull().default("0"),
  total: numeric("total", { precision: 18, scale: 4 }).notNull(),
  status: text("status").notNull().default("DRAFT"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendorBillLines = pgTable("vendor_bill_lines", {
  id: text("id").primaryKey(),
  vendorBillId: text("vendor_bill_id")
    .notNull()
    .references(() => vendorBills.id, { onDelete: "cascade" }),
  chargeId: text("charge_id"),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
  currency: text("currency").notNull(),
});

export const approvalConfig = pgTable("approval_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
