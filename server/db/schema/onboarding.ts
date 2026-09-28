import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";

/** First-run tour progress — one row per finished (or skipped) tour per user. */
export const userOnboarding = pgTable(
  "user_onboarding",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tourKey: text("tour_key").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tourKey] })],
);

export type DbUserOnboarding = typeof userOnboarding.$inferSelect;
