import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { organizations } from "./tenancy.js";

/** Company profile used on documents (invoice / billing note / quotation) and in the app header. */
export const organizationProfiles = pgTable("organization_profiles", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  nameEn: text("name_en").notNull().default(""),
  nameTh: text("name_th"),
  nameZh: text("name_zh"),
  taxId: text("tax_id"),
  /** head_office | branch */
  branchType: text("branch_type").notNull().default("head_office"),
  branchCode: text("branch_code"),
  addressEn: text("address_en"),
  addressTh: text("address_th"),
  addressZh: text("address_zh"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  logoKey: text("logo_key"),
  logoMime: text("logo_mime"),
  bankName: text("bank_name"),
  bankBranch: text("bank_branch"),
  bankAccountName: text("bank_account_name"),
  bankAccountNo: text("bank_account_no"),
  bankSwift: text("bank_swift"),
  defaultCurrency: text("default_currency").notNull().default("THB"),
  invoiceFooter: text("invoice_footer"),
  quotationFooter: text("quotation_footer"),
  /** Module switches ({ finance: false, … }); a missing key = ON (migration 0019). */
  modules: jsonb("modules").$type<Record<string, boolean>>().notNull().default({}),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrganizationProfile = typeof organizationProfiles.$inferSelect;
