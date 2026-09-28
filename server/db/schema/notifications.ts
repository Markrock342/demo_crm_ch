import { boolean, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { organizations } from "./tenancy.js";

/** One row per (organization, rule key). Missing rows = rule enabled with defaults. */
export const automationRules = pgTable(
  "automation_rules",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    channels: jsonb("channels").$type<string[]>().notNull().default(["in_app"]),
    /** Rule memory between runs (e.g. last seen ETA per job for "ETA changed"). */
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastResult: jsonb("last_result").$type<{ matched: number; created: number } | null>(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.key] })],
);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  params: jsonb("params").$type<Record<string, string | number | null>>().notNull().default({}),
  refType: text("ref_type"),
  refId: text("ref_id"),
  href: text("href"),
  /** Unique per (organization, user) — a rule never notifies the same person twice for one event. */
  dedupeKey: text("dedupe_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  lineSentAt: timestamp("line_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Optional delivery channels per user (in-app is always on and has no row). */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    /** LINE: the user's LINE userId once linked. */
    address: text("address"),
    enabled: boolean("enabled").notNull().default(true),
    linkCode: text("link_code"),
    linkCodeExpiresAt: timestamp("link_code_expires_at", { withTimezone: true }),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId, t.channel] })],
);

export type DbNotification = typeof notifications.$inferSelect;
export type DbAutomationRule = typeof automationRules.$inferSelect;
