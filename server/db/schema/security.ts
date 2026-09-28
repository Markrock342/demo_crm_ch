import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Staff login brute-force guard (migration 0014). key = lower(email) + "|" + IP. */
export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  email: text("email").notNull().default(""),
  ip: text("ip").notNull().default(""),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
