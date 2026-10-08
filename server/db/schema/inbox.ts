import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { contacts, customers } from "./crm.js";
import { organizations } from "./tenancy.js";

/** Business units in the client's group (ธุรกิจในเครือ) — tagged on cases, customers and LINE OAs. */
export const businessUnits = pgTable("business_units", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Chip colour key (teal | blue | amber | violet | rose | slate); null = automatic. */
  color: text("color"),
  /** Cover photo from the built-in gallery (/demo/unit-*.webp); null = colour only. */
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A company LINE Official Account. Secret / token are encrypted with lib/secret-box. */
export const lineChannels = pgTable("line_channels", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  basicId: text("basic_id"),
  /** The bot's own user id ("destination" in webhook bodies). */
  botUserId: text("bot_user_id"),
  channelSecretEnc: text("channel_secret_enc"),
  accessTokenEnc: text("access_token_enc"),
  /** Last 4 characters of the access token, to tell tokens apart in settings. */
  tokenHint: text("token_hint"),
  /** Random slug in the webhook URL: /api/webhooks/line/<key>. */
  webhookKey: text("webhook_key").notNull(),
  businessUnitId: text("business_unit_id").references(() => businessUnits.id, { onDelete: "set null" }),
  /** Instant LINE reply when a chat opens a case ({case} = case number); null = off. */
  ackMessage: text("ack_message"),
  active: boolean("active").notNull().default(true),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A customer's LINE account as seen by one OA. */
export const lineContacts = pgTable("line_contacts", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  channelId: text("channel_id")
    .notNull()
    .references(() => lineChannels.id, { onDelete: "cascade" }),
  lineUserId: text("line_user_id").notNull(),
  displayName: text("display_name"),
  pictureUrl: text("picture_url"),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  followed: boolean("followed").notNull().default(true),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbBusinessUnit = typeof businessUnits.$inferSelect;
export type DbLineChannel = typeof lineChannels.$inferSelect;
export type DbLineContact = typeof lineContacts.$inferSelect;
