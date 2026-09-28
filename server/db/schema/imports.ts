import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { organizations } from "./tenancy.js";

/** A record created by an import batch (deleted again on undo, newest first). */
export type ImportedItem = { type: "customer" | "contact" | "vendor" | "rate_sheet" | "job"; id: string };

export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  entity: text("entity").notNull(),
  fileName: text("file_name").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  rowCount: integer("row_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  items: jsonb("items").$type<ImportedItem[]>().notNull().default([]),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
  undoneBy: uuid("undone_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbImportBatch = typeof importBatches.$inferSelect;
