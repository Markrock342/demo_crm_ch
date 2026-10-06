import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { organizationProfiles } from "../db/schema/organization.js";
import { organizations } from "../db/schema/tenancy.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { MODULE_PRESETS, normalizeModules, type ModuleKey, type ModuleSet } from "../domain/modules.js";
import { writeAudit } from "./audit.service.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbLike = Db | Tx;

/**
 * Module switches are read on every API request (module gate), so they are cached per organization
 * for a few seconds (MODULES_CACHE_TTL_MS, default 5000; 0 = no cache). A change made on this
 * instance applies at once; other server instances pick it up within the TTL.
 */
const TTL = Math.max(0, Number(process.env.MODULES_CACHE_TTL_MS ?? 5000) || 0);
const cache = new Map<string, { at: number; set: ModuleSet }>();

export function forgetModules(organizationId?: string) {
  if (organizationId) cache.delete(organizationId);
  else cache.clear();
}

export async function getOrganizationModules(db: DbLike, organizationId: string): Promise<ModuleSet> {
  const hit = TTL ? cache.get(organizationId) : undefined;
  if (hit && Date.now() - hit.at < TTL) return hit.set;
  const [row] = await db
    .select({ modules: organizationProfiles.modules })
    .from(organizationProfiles)
    .where(eq(organizationProfiles.organizationId, organizationId))
    .limit(1);
  const set = normalizeModules(row?.modules);
  if (TTL) {
    if (cache.size > 2000) cache.clear();
    cache.set(organizationId, { at: Date.now(), set });
  }
  return set;
}

/** Merge a partial patch into the organization's switches (creates the profile row if missing). */
export async function setOrganizationModules(
  db: Db,
  organizationId: string,
  userId: string | null,
  patch: Partial<ModuleSet>,
): Promise<{ before: ModuleSet; after: ModuleSet }> {
  forgetModules(organizationId);
  const before = await getOrganizationModules(db, organizationId);
  const after = normalizeModules({ ...before, ...patch });
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  await db
    .insert(organizationProfiles)
    .values({ organizationId, nameEn: org?.name ?? "", modules: after, updatedBy: userId })
    .onConflictDoUpdate({
      target: organizationProfiles.organizationId,
      set: { modules: after, updatedBy: userId, updatedAt: new Date() },
    });
  forgetModules(organizationId);
  const changed = (Object.keys(after) as ModuleKey[]).filter((k) => after[k] !== before[k]);
  if (changed.length) {
    await writeAudit(db, {
      userId,
      organizationId,
      action: "ORG_MODULES_UPDATED",
      entityType: "organization",
      entityId: organizationId,
      oldValue: Object.fromEntries(changed.map((k) => [k, before[k]])),
      newValue: Object.fromEntries(changed.map((k) => [k, after[k]])),
    });
  }
  return { before, after };
}

/** Seed: the demo company starts on the "marketing + customer service" preset (admins can switch back). */
export async function seedDemoModules(db: Db) {
  await setOrganizationModules(db, DEMO_ORG_ID, null, MODULE_PRESETS.marketing_cs);
}
