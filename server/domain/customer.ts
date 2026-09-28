import { z } from "zod";
import {
  BUSINESS_TYPES,
  CONTAINER_TYPES,
  CURRENCIES,
  CUSTOMER_STATUSES,
  INCOTERMS,
  LEAD_SOURCES,
  PAYMENT_METHODS,
  isPortCode,
  isValidThaiTaxId,
  normalizeBranchNo,
  normalizeTaxId,
} from "../../src/lib/customerProfile.js";

/** Optional free text: trims, "" → null. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const email = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "invalid_email" });

const enumOrNull = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

export const contactInputSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1, { message: "required" }).max(120),
  title: text(120),
  email,
  phone: text(50),
  wechat: text(80),
  lineId: text(80),
  primary: z.boolean().optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

const laneSchema = z
  .object({
    pol: z.string().trim().toUpperCase(),
    pod: z.string().trim().toUpperCase(),
  })
  .refine((l) => isPortCode(l.pol) && isPortCode(l.pod), { message: "invalid_port" })
  .refine((l) => l.pol !== l.pod, { message: "same_port" });

const listOf = (max: number) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(max)
    .optional()
    .transform((v) => (v ? [...new Set(v)] : undefined));

/** Every field optional here; create adds "at least one name" on top. */
const customerFields = z.object({
  nameZh: text(200),
  nameTh: text(200),
  nameEn: text(200),
  city: text(120),
  businessType: enumOrNull(BUSINESS_TYPES),
  website: text(200),
  industry: text(200),
  leadSource: enumOrNull(LEAD_SOURCES),
  ownerUserId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional().transform((v) => (v === undefined ? undefined : v || null)),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  notes: text(4000),

  taxId: z
    .string()
    .nullish()
    .transform((v) => normalizeTaxId(v) || null),
  branchNo: z
    .string()
    .nullish()
    .transform((v) => normalizeBranchNo(v)),
  billingAddress: text(1000),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .max(8)
    .nullish()
    .transform((v) => (v ? v : null)),
  currency: enumOrNull(CURRENCIES),
  creditTermDays: z.number().int().min(0).max(365).nullish(),
  creditLimit: z
    .union([z.number(), z.string().trim()])
    .nullish()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1e13) {
        ctx.addIssue({ code: "custom", message: "invalid_amount" });
        return z.NEVER;
      }
      return n.toFixed(2);
    }),
  paymentMethod: enumOrNull(PAYMENT_METHODS),
  billingEmail: email,

  preferredLanes: z.array(laneSchema).max(20).optional(),
  containerTypes: z
    .array(z.enum(CONTAINER_TYPES))
    .max(CONTAINER_TYPES.length)
    .optional()
    .transform((v) => (v ? [...new Set(v)] : undefined)),
  commodities: listOf(30),
  incoterms: enumOrNull(INCOTERMS),
  customsBroker: z.boolean().nullish(),
  handlingNotes: text(2000),

  contacts: z.array(contactInputSchema).max(50).optional(),

  // Legacy quick-create (lead → customer conversion): free-text lane + owner name.
  cityZh: text(120),
  laneZh: text(200),
  laneTh: text(200),
  laneEn: text(200),
  owner: text(120),
});

type Fields = z.infer<typeof customerFields>;

/** Tax ID must pass the Thai check digit when the billing country is Thailand. */
function checkTaxId(v: { taxId?: string | null; country?: string | null }, ctx: z.RefinementCtx) {
  const err = taxIdError(v.taxId, v.country);
  if (err) ctx.addIssue({ code: "custom", path: ["taxId"], message: err });
}

export const customerCreateSchema = customerFields.superRefine((v, ctx) => {
  if (!v.nameZh && !v.nameTh && !v.nameEn) {
    ctx.addIssue({ code: "custom", path: ["name"], message: "name_required" });
  }
  checkTaxId(v, ctx);
});

/** Patch: tax ID is checked after merging with the stored country (see taxIdError). */
export const customerPatchSchema = customerFields;

/** Error code for a tax ID / country pair, or null when fine. */
export function taxIdError(taxId: string | null | undefined, country: string | null | undefined): string | null {
  if (!taxId) return null;
  if (taxId.length > 30) return "too_long";
  if ((country ?? "TH") === "TH" && !isValidThaiTaxId(taxId)) return "invalid_thai_tax_id";
  return null;
}

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerPatchInput = z.infer<typeof customerPatchSchema>;

/**
 * Fill the three display-name columns: each missing language falls back to another entered name,
 * and `nameLangs` records which ones a person actually typed.
 */
export function resolveNames(v: Pick<Fields, "nameZh" | "nameTh" | "nameEn">) {
  const typed = { zh: v.nameZh ?? "", th: v.nameTh ?? "", en: v.nameEn ?? "" };
  const any = typed.en || typed.th || typed.zh;
  return {
    nameZh: typed.zh || typed.en || typed.th || any,
    nameTh: typed.th || typed.en || typed.zh || any,
    nameEn: typed.en || typed.th || typed.zh || any,
    nameLangs: (["zh", "th", "en"] as const).filter((k) => typed[k]).join(","),
  };
}

/** At most one primary contact; the first contact becomes primary when none is flagged. */
export function normalizeContacts<T extends { primary?: boolean }>(list: T[]): (T & { primary: boolean })[] {
  let idx = list.findIndex((c) => c.primary);
  if (idx < 0 && list.length) idx = 0;
  return list.map((c, i) => ({ ...c, primary: i === idx }));
}

/** "CNSHA → THLCH" for rows that only have lane codes. */
export function laneLabel(lanes: { pol: string; pod: string }[] | undefined | null): string | null {
  const l = lanes?.[0];
  return l ? `${l.pol} → ${l.pod}` : null;
}
