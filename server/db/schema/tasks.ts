import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { customers } from "./crm.js";
import { jobs } from "./operations.js";
import { organizations } from "./tenancy.js";

/** Org-wide to-dos (สิ่งที่ต้องทำ). Job checklists live in job_tasks. */
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  title: text("title").notNull(),
  notes: text("notes"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  /** high | mid | low */
  priority: text("priority").notNull().default("mid"),
  /** open | done */
  status: text("status").notNull().default("open"),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  containerNo: text("container_no"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Activity log on customers / jobs: call, mail, meet, note, task. */
export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  type: text("type").notNull(),
  body: text("body").notNull(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbTask = typeof tasks.$inferSelect;
export type DbActivity = typeof activities.$inferSelect;
