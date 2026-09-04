import { boolean, date, integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { customers } from "./crm.js";
import { quotations, quotationRevisions, vendors } from "./commercial.js";
import { organizations } from "./tenancy.js";

export const bookings = pgTable("bookings", {
  id: text("id").primaryKey(),
  bookingNumber: text("booking_number").notNull().unique(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  quotationId: text("quotation_id").references(() => quotations.id),
  quotationRevisionId: text("quotation_revision_id").references(() => quotationRevisions.id),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  pol: text("pol").notNull(),
  pod: text("pod").notNull(),
  mode: text("mode").notNull(),
  carrier: text("carrier"),
  containerType: text("container_type"),
  quantity: integer("quantity").notNull().default(1),
  commodity: text("commodity"),
  weight: numeric("weight", { precision: 18, scale: 4 }),
  cbm: numeric("cbm", { precision: 18, scale: 4 }),
  salesOwnerId: text("sales_owner_id"),
  status: text("status").notNull().default("CONFIRMED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  jobNumber: text("job_number").notNull().unique(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  bookingId: text("booking_id").references(() => bookings.id),
  quotationId: text("quotation_id").references(() => quotations.id),
  quotationRevisionId: text("quotation_revision_id"),
  direction: text("direction").notNull().default("EXPORT"),
  mode: text("mode").notNull(),
  serviceType: text("service_type").notNull().default("PORT_TO_PORT"),
  incoterm: text("incoterm"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  pol: text("pol").notNull(),
  pod: text("pod").notNull(),
  carrier: text("carrier"),
  bookingNumber: text("booking_number"),
  masterBl: text("master_bl"),
  houseBl: text("house_bl"),
  vessel: text("vessel"),
  voyage: text("voyage"),
  etd: text("etd"),
  eta: text("eta"),
  commodity: text("commodity"),
  containerType: text("container_type"),
  containerCount: integer("container_count").notNull().default(0),
  teu: integer("teu").notNull().default(0),
  salesOwnerId: text("sales_owner_id"),
  assignedOperator: text("assigned_operator"),
  status: text("status").notNull().default("BOOKING"),
  currency: text("currency").notNull().default("THB"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shipmentCharges = pgTable("shipment_charges", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  chargeCode: text("charge_code").notNull(),
  chargeType: text("charge_type").notNull(),
  source: text("source").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  currency: text("currency").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }).notNull().default("1"),
  unitAmount: numeric("unit_amount", { precision: 18, scale: 4 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 18, scale: 4 }).notNull(),
  quotedAmount: numeric("quoted_amount", { precision: 18, scale: 4 }),
  actualAmount: numeric("actual_amount", { precision: 18, scale: 4 }),
  vendorId: text("vendor_id").references(() => vendors.id),
  customerId: text("customer_id").references(() => customers.id),
  status: text("status").notNull().default("OPEN"),
  invoiced: boolean("invoiced").notNull().default(false),
  billed: boolean("billed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const containers = pgTable("containers", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "restrict" }),
  containerNo: text("container_no").notNull().unique(),
  type: text("type").notNull(),
  status: text("status").notNull().default("yard"),
  direction: text("direction").notNull(),
  bl: text("bl"),
  pol: text("pol"),
  pod: text("pod"),
  teu: integer("teu").notNull().default(1),
  eta: date("eta"),
  yardCode: text("yard_code"),
  vessel: text("vessel"),
  seal: text("seal"),
  commodity: text("commodity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobMilestones = pgTable(
  "job_milestones",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    actualAt: timestamp("actual_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [unique("job_milestones_job_code").on(t.jobId, t.code)],
);
