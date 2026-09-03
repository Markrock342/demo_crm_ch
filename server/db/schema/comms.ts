import { boolean, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./crm.js";

export const mails = pgTable("mails", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  fromAddr: text("from_addr").notNull().default(""),
  subjectZh: text("subject_zh").notNull().default(""),
  subjectTh: text("subject_th").notNull().default(""),
  subjectEn: text("subject_en").notNull().default(""),
  bodyZh: text("body_zh").notNull().default(""),
  bodyTh: text("body_th").notNull().default(""),
  bodyEn: text("body_en").notNull().default(""),
  draftZh: text("draft_zh").notNull().default(""),
  draftTh: text("draft_th").notNull().default(""),
  draftEn: text("draft_en").notNull().default(""),
  timeLabel: text("time_label").notNull().default(""),
  confidence: numeric("confidence", { precision: 8, scale: 4 }).notNull().default("0"),
  unread: boolean("unread").notNull().default(true),
  state: text("state").notNull().default("open"),
  intent: text("intent"),
  summary: text("summary"),
  origin: text("origin"),
  dest: text("dest"),
  extractedBoxes: jsonb("extracted_boxes").$type<string[]>().notNull().default([]),
  docsMissing: jsonb("docs_missing").$type<string[]>().notNull().default([]),
  suggestedStatus: text("suggested_status"),
  needsHuman: boolean("needs_human").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crmDocs = pgTable("crm_docs", {
  id: text("id").primaryKey(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  boxId: text("box_id").notNull().default(""),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("wait"),
  updated: text("updated").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
