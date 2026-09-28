import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { organizationProfiles, type OrganizationProfile } from "../db/schema/organization.js";
import { organizations } from "../db/schema/tenancy.js";
import { readObject, saveObject } from "../lib/storage.js";
import { writeAudit } from "./audit.service.js";

export type OrganizationDto = {
  id: string;
  slug: string;
  /** Internal organization name (tenancy). */
  orgName: string;
  nameEn: string;
  nameTh: string | null;
  nameZh: string | null;
  taxId: string | null;
  branchType: "head_office" | "branch";
  branchCode: string | null;
  addressEn: string | null;
  addressTh: string | null;
  addressZh: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  hasLogo: boolean;
  logoUpdatedAt: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankSwift: string | null;
  defaultCurrency: string;
  invoiceFooter: string | null;
  quotationFooter: string | null;
  updatedAt: string | null;
};

export type OrganizationPatch = Partial<
  Omit<OrganizationDto, "id" | "slug" | "orgName" | "hasLogo" | "logoUpdatedAt" | "updatedAt">
>;

export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg"] as const;

function toDto(org: typeof organizations.$inferSelect, p: OrganizationProfile | undefined): OrganizationDto {
  return {
    id: org.id,
    slug: org.slug,
    orgName: org.name,
    nameEn: p?.nameEn || org.name,
    nameTh: p?.nameTh ?? null,
    nameZh: p?.nameZh ?? null,
    taxId: p?.taxId ?? null,
    branchType: p?.branchType === "branch" ? "branch" : "head_office",
    branchCode: p?.branchCode ?? null,
    addressEn: p?.addressEn ?? null,
    addressTh: p?.addressTh ?? null,
    addressZh: p?.addressZh ?? null,
    phone: p?.phone ?? null,
    email: p?.email ?? null,
    website: p?.website ?? null,
    hasLogo: Boolean(p?.logoKey),
    logoUpdatedAt: p?.logoKey ? p.updatedAt.toISOString() : null,
    bankName: p?.bankName ?? null,
    bankBranch: p?.bankBranch ?? null,
    bankAccountName: p?.bankAccountName ?? null,
    bankAccountNo: p?.bankAccountNo ?? null,
    bankSwift: p?.bankSwift ?? null,
    defaultCurrency: p?.defaultCurrency ?? "THB",
    invoiceFooter: p?.invoiceFooter ?? null,
    quotationFooter: p?.quotationFooter ?? null,
    updatedAt: p?.updatedAt.toISOString() ?? null,
  };
}

export async function getOrganizationProfile(db: Db, organizationId: string): Promise<OrganizationDto | null> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!org) return null;
  const [p] = await db
    .select()
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);
  return toDto(org, p);
}

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

export async function updateOrganizationProfile(
  db: Db,
  organizationId: string,
  actorId: string,
  patch: OrganizationPatch,
): Promise<OrganizationDto> {
  const before = await getOrganizationProfile(db, organizationId);
  if (!before) throw new Error("not_found");

  const set: Partial<typeof organizationProfiles.$inferInsert> = {};
  const textKeys = [
    "nameTh",
    "nameZh",
    "taxId",
    "branchCode",
    "addressEn",
    "addressTh",
    "addressZh",
    "phone",
    "email",
    "website",
    "bankName",
    "bankBranch",
    "bankAccountName",
    "bankAccountNo",
    "bankSwift",
    "invoiceFooter",
    "quotationFooter",
  ] as const;
  for (const k of textKeys) {
    const v = blankToNull(patch[k]);
    if (v !== undefined) set[k] = v;
  }
  if (patch.nameEn !== undefined) set.nameEn = patch.nameEn.trim();
  if (patch.branchType !== undefined) set.branchType = patch.branchType;
  if (patch.branchType === "head_office") set.branchCode = null;
  if (patch.defaultCurrency !== undefined) set.defaultCurrency = patch.defaultCurrency.toUpperCase();

  const now = new Date();
  await db
    .insert(organizationProfiles)
    .values({ organizationId, nameEn: set.nameEn ?? before.nameEn, ...set, updatedBy: actorId, updatedAt: now })
    .onConflictDoUpdate({ target: organizationProfiles.organizationId, set: { ...set, updatedBy: actorId, updatedAt: now } });

  const after = (await getOrganizationProfile(db, organizationId))!;
  await writeAudit(db, {
    userId: actorId,
    action: "ORGANIZATION_UPDATE",
    entityType: "organization",
    entityId: organizationId,
    oldValue: before,
    newValue: after,
  });
  return after;
}

/** Detects PNG / JPEG by magic bytes (the browser-provided type is not trusted). */
export function sniffImageType(bytes: Uint8Array): (typeof LOGO_TYPES)[number] | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function saveOrganizationLogo(db: Db, organizationId: string, actorId: string, bytes: Buffer): Promise<OrganizationDto> {
  if (bytes.length > LOGO_MAX_BYTES) throw new Error("logo_too_large");
  const mime = sniffImageType(bytes);
  if (!mime) throw new Error("logo_invalid_type");
  const key = `org-logo-${Date.now()}.${mime === "image/png" ? "png" : "jpg"}`;
  await saveObject(organizationId, key, bytes);
  const before = await getOrganizationProfile(db, organizationId);
  if (!before) throw new Error("not_found");
  const now = new Date();
  await db
    .insert(organizationProfiles)
    .values({ organizationId, nameEn: before.nameEn, logoKey: key, logoMime: mime, updatedBy: actorId, updatedAt: now })
    .onConflictDoUpdate({
      target: organizationProfiles.organizationId,
      set: { logoKey: key, logoMime: mime, updatedBy: actorId, updatedAt: now },
    });
  await writeAudit(db, { userId: actorId, action: "ORGANIZATION_LOGO", entityType: "organization", entityId: organizationId });
  return (await getOrganizationProfile(db, organizationId))!;
}

export async function removeOrganizationLogo(db: Db, organizationId: string, actorId: string): Promise<OrganizationDto> {
  await db
    .update(organizationProfiles)
    .set({ logoKey: null, logoMime: null, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(organizationProfiles.organizationId, organizationId));
  return (await getOrganizationProfile(db, organizationId))!;
}

export async function readOrganizationLogo(
  db: Db,
  organizationId: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const [p] = await db
    .select({ key: organizationProfiles.logoKey, mime: organizationProfiles.logoMime })
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);
  if (!p?.key) return null;
  const bytes = await readObject(organizationId, p.key);
  return bytes ? { bytes, mime: p.mime ?? "image/png" } : null;
}
