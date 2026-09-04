import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { organizationMembers, organizations } from "../db/schema/tenancy.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";

export type TenantContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

/** Returns false when resource belongs to another tenant (for isolation tests). */
export function tenantResourceMatches(resourceOrgId: string | null | undefined, sessionOrgId: string): boolean {
  return resourceOrgId === sessionOrgId;
}

export async function ensureDemoOrganization(db: Db) {
  await db
    .insert(organizations)
    .values({ id: DEMO_ORG_ID, slug: "cangzhan-demo", name: "CANGZHAN Demo", timezone: "Asia/Bangkok" })
    .onConflictDoNothing({ target: organizations.id });
}

export async function linkUserToOrganization(db: Db, userId: string, organizationId: string, orgRole = "member") {
  await db
    .insert(organizationMembers)
    .values({ organizationId, userId, orgRole })
    .onConflictDoNothing();
}

export async function resolvePrimaryOrganization(db: Db, userId: string): Promise<TenantContext | null> {
  const [row] = await db
    .select({
      organizationId: organizationMembers.organizationId,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), eq(organizations.active, true)))
    .limit(1);
  if (!row) return null;
  return {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
  };
}

export async function userHasOrganizationAccess(db: Db, userId: string, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  return !!row;
}

export async function resolveSessionOrganization(
  db: Db,
  userId: string,
  sessionOrgId: string | undefined,
): Promise<TenantContext | null> {
  if (sessionOrgId) {
    const ok = await userHasOrganizationAccess(db, userId, sessionOrgId);
    if (!ok) return null;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, sessionOrgId)).limit(1);
    if (!org?.active) return null;
    return { organizationId: org.id, organizationName: org.name, organizationSlug: org.slug };
  }
  return resolvePrimaryOrganization(db, userId);
}
