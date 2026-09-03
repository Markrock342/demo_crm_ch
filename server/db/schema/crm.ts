import { integer, pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
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
  primary: boolean("primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  city: text("city").notNull(),
  lane: text("lane").notNull(),
  contact: text("contact").notNull(),
  source: text("source").notNull(),
  stage: text("stage").notNull(),
  teu: integer("teu").notNull().default(0),
  owner: text("owner").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbCustomer = typeof customers.$inferSelect;
export type DbContact = typeof contacts.$inferSelect;
export type DbLead = typeof leads.$inferSelect;
export type DbOpportunity = typeof opportunities.$inferSelect;
