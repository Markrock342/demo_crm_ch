import { and, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { userOnboarding } from "../db/schema/onboarding.js";

/** Tour keys are short slugs like "role-sales" — anything else is rejected. */
export const TOUR_KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export function isValidTourKey(key: unknown): key is string {
  return typeof key === "string" && TOUR_KEY_RE.test(key);
}

/** Finished tours for a user: { tourKey: ISO completedAt }. */
export async function listCompletedTours(db: Db, userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ tourKey: userOnboarding.tourKey, completedAt: userOnboarding.completedAt })
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.tourKey] = r.completedAt.toISOString();
  return out;
}

export async function markTourComplete(db: Db, userId: string, tourKey: string): Promise<string> {
  const now = new Date();
  await db
    .insert(userOnboarding)
    .values({ userId, tourKey, completedAt: now })
    .onConflictDoUpdate({ target: [userOnboarding.userId, userOnboarding.tourKey], set: { completedAt: now } });
  return now.toISOString();
}

export async function resetTour(db: Db, userId: string, tourKey: string): Promise<void> {
  await db.delete(userOnboarding).where(and(eq(userOnboarding.userId, userId), eq(userOnboarding.tourKey, tourKey)));
}
