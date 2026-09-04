import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { jobs } from "./operations.js";
import { organizations } from "./tenancy.js";

export const jobTasks = pgTable("job_tasks", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  owner: text("owner").notNull().default(""),
  priority: text("priority").notNull().default("mid"),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbJobTask = typeof jobTasks.$inferSelect;
