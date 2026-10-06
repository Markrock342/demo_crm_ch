import { integer, jsonb, numeric, pgTable, text, timestamp, boolean, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./tenancy.js";
import { users } from "./auth.js";

export type LanePair = { pol: string; pod: string };

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  nameZh: text("name_zh").notNull(),
  nameTh: text("name_th").notNull(),
  nameEn: text("name_en").notNull(),
  cityZh: text("city_zh").notNull(),
  cityTh: text("city_th").notNull(),
  cityEn: text("city_en").notNull(),
  laneZh: text("lane_zh").notNull(),
  laneTh: text("lane_th").notNull(),
  laneEn: text("lane_en").notNull(),
  owner: text("owner").notNull(),
  updated: text("updated").notNull(),
  arDays: integer("ar_days").notNull().default(0),
  portalPin: text("portal_pin").notNull().default("demo"),
  /** Which of nameZh / nameTh / nameEn were typed by a person ("th,en"); the rest are fallbacks. Null = legacy row. */
  nameLangs: text("name_langs"),
  businessType: text("business_type"),
  website: text("website"),
  industry: text("industry"),
  leadSource: text("lead_source"),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  taxId: text("tax_id"),
  /** null / "" = head office; otherwise the 5-digit branch number. */
  branchNo: text("branch_no"),
  billingAddress: text("billing_address"),
  country: text("country"),
  currency: text("currency"),
  creditTermDays: integer("credit_term_days"),
  creditLimit: numeric("credit_limit", { precision: 18, scale: 2 }),
  paymentMethod: text("payment_method"),
  billingEmail: text("billing_email"),
  preferredLanes: jsonb("preferred_lanes").$type<LanePair[]>().notNull().default([]),
  containerTypes: jsonb("container_types").$type<string[]>().notNull().default([]),
  commodities: jsonb("commodities").$type<string[]>().notNull().default([]),
  incoterms: text("incoterms"),
  customsBroker: boolean("customs_broker"),
  handlingNotes: text("handling_notes"),
  /** Business unit ids (ธุรกิจในเครือ) this customer uses. */
  businessUnits: jsonb("business_units").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  title: text("title").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  wechat: text("wechat").notNull().default(""),
  lineId: text("line_id").notNull().default(""),
  primary: boolean("primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  company: text("company").notNull(),
  city: text("city").notNull(),
  lane: text("lane").notNull(),
  contact: text("contact").notNull(),
  source: text("source").notNull(),
  stage: text("stage").notNull(),
  teu: integer("teu").notNull().default(0),
  owner: text("owner").notNull(),
  /** Staff owner; `owner` keeps the display name as a fallback for legacy rows. */
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  updated: text("updated").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  lane: text("lane").notNull(),
  stage: text("stage").notNull(),
  value: integer("value").notNull().default(0),
  teu: integer("teu").notNull().default(0),
  close: text("close").notNull(),
  owner: text("owner").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  currency: text("currency").notNull().default("THB"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbCustomer = typeof customers.$inferSelect;
export type DbContact = typeof contacts.$inferSelect;
export type DbLead = typeof leads.$inferSelect;
export type DbOpportunity = typeof opportunities.$inferSelect;
