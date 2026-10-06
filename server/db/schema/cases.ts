import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { contacts, customers } from "./crm.js";
import { bookings, jobs } from "./operations.js";
import { organizations } from "./tenancy.js";

/** Customer service cases (เคส / 工单). */
export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  caseNo: text("case_no").notNull(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  /** phone | email | line | walk_in | portal */
  channel: text("channel").notNull().default("phone"),
  /** status_inquiry | documents | pricing | complaint | other */
  category: text("category").notNull().default("other"),
  /** low | normal | high | urgent */
  priority: text("priority").notNull().default("normal"),
  /** new | in_progress | waiting_customer | resolved | closed */
  status: text("status").notNull().default("new"),
  subject: text("subject").notNull(),
  description: text("description"),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  containerNo: text("container_no"),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  sourceMailId: text("source_mail_id"),
  firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }),
  resolveDueAt: timestamp("resolve_due_at", { withTimezone: true }),
  firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Case timeline: created, comment (internal note), reply (to the customer), status, assignment, priority, category, link. */
export const caseEvents = pgTable("case_events", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  body: text("body"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  mailId: text("mail_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Canned replies with {customer} {container} {eta} {vessel} {job} {agent} variables. */
export const cannedReplies = pgTable("canned_replies", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** SLA targets per priority (minutes). Missing rows → built-in defaults. */
export const caseSlaPolicies = pgTable(
  "case_sla_policies",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    priority: text("priority").notNull(),
    firstResponseMinutes: integer("first_response_minutes").notNull(),
    resolveMinutes: integer("resolve_minutes").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.priority] })],
);

export type DbCase = typeof cases.$inferSelect;
export type DbCaseEvent = typeof caseEvents.$inferSelect;
export type DbCannedReply = typeof cannedReplies.$inferSelect;
