import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { quoteAcceptanceTokens, quotations } from "../db/schema/commercial.js";
import { organizationProfiles } from "../db/schema/organization.js";
import { organizations } from "../db/schema/tenancy.js";

/**
 * White-label branding: the client company's name + logo shown on screens that have no signed-in
 * staff user yet (login, customer-portal entry, public quotation). Only the name and a logo URL are
 * ever exposed here — nothing else from the company profile.
 */
export type PublicBranding = {
  /** Company name per language; null when no organization is resolved (neutral product branding). */
  name: { th: string | null; zh: string | null; en: string } | null;
  /** Public, versioned logo URL, or null when no logo is uploaded. */
  logoUrl: string | null;
};

export const EMPTY_BRANDING: PublicBranding = { name: null, logoUrl: null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which company a deployment's pre-login screens show:
 *  1. DEFAULT_ORG_ID — an organization id (uuid) or slug; "none" turns branding off (neutral product mark).
 *  2. unset → the only active organization, when exactly one exists;
 *  3. otherwise the first active organization created (the deployment's original company).
 * Inactive or unknown organizations resolve to null.
 */
export async function resolveDefaultOrganizationId(db: Db, envValue = process.env.DEFAULT_ORG_ID): Promise<string | null> {
  const want = envValue?.trim();
  if (want) {
    if (["none", "off", "false", "0"].includes(want.toLowerCase())) return null;
    const where = UUID_RE.test(want) ? eq(organizations.id, want) : eq(organizations.slug, want);
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(where, eq(organizations.active, true)))
      .limit(1);
    return row?.id ?? null;
  }
  const [first] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.active, true))
    .orderBy(asc(organizations.createdAt), asc(organizations.id))
    .limit(1);
  return first?.id ?? null;
}

/** Name + logo for one organization; `logoPath` is the public route that serves that logo. */
export async function getBranding(db: Db, organizationId: string | null, logoPath: string): Promise<PublicBranding> {
  if (!organizationId) return EMPTY_BRANDING;
  const [row] = await db
    .select({
      orgName: organizations.name,
      nameEn: organizationProfiles.nameEn,
      nameTh: organizationProfiles.nameTh,
      nameZh: organizationProfiles.nameZh,
      logoKey: organizationProfiles.logoKey,
      updatedAt: organizationProfiles.updatedAt,
    })
    .from(organizations)
    .leftJoin(organizationProfiles, eq(organizationProfiles.organizationId, organizations.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!row) return EMPTY_BRANDING;
  const clean = (v: string | null | undefined) => v?.trim() || null;
  return {
    name: { en: clean(row.nameEn) ?? row.orgName, th: clean(row.nameTh), zh: clean(row.nameZh) },
    logoUrl: row.logoKey ? `${logoPath}?v=${encodeURIComponent(row.updatedAt?.toISOString() ?? row.logoKey)}` : null,
  };
}

/** Organization that issued the quotation behind a live public acceptance token (same rule as getPublicQuotation). */
export async function quoteTokenOrganizationId(db: Db, token: string): Promise<string | null> {
  const [row] = await db
    .select({
      organizationId: quotations.organizationId,
      revoked: quoteAcceptanceTokens.revoked,
      expiresAt: quoteAcceptanceTokens.expiresAt,
    })
    .from(quoteAcceptanceTokens)
    .innerJoin(quotations, eq(quotations.id, quoteAcceptanceTokens.quotationId))
    .where(eq(quoteAcceptanceTokens.token, token))
    .limit(1);
  if (!row || row.revoked || row.expiresAt < new Date()) return null;
  return row.organizationId;
}

/** Response headers for a logo image (PNG / JPEG only — never SVG, so no script can ride along). */
export function logoHeaders(mime: string, scope: "public" | "private") {
  return {
    "Content-Type": mime,
    "Cache-Control": `${scope}, max-age=3600`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
}
