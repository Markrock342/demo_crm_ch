import { Hono, type Context } from "hono";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import { requireAuth, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { isValidTourKey, listCompletedTours, markTourComplete, resetTour } from "../services/onboarding.service.js";

function dbOr503(c: Context<AuthEnv>): Db | Response {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

/** Signed-in user's own first-run tour progress (per user, not per organization). */
export function onboardingRoutes() {
  const r = new Hono<AuthEnv>();
  // Session is resolved by the app-wide authMiddleware; mounted at /api/onboarding.
  r.use("*", requireAuth(), requireTenant());

  r.get("/", async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const user = c.get("user")!;
    return c.json({ completed: await listCompletedTours(db, user.id) });
  });

  r.put("/:tourKey", async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const tourKey = c.req.param("tourKey");
    if (!isValidTourKey(tourKey)) return c.json({ error: "invalid_body", issues: [{ path: "tourKey", message: "invalid" }] }, 400);
    const completedAt = await markTourComplete(db, c.get("user")!.id, tourKey);
    return c.json({ tourKey, completedAt });
  });

  r.delete("/:tourKey", async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const tourKey = c.req.param("tourKey");
    if (!isValidTourKey(tourKey)) return c.json({ error: "invalid_body", issues: [{ path: "tourKey", message: "invalid" }] }, 400);
    await resetTour(db, c.get("user")!.id, tourKey);
    return c.json({ ok: true });
  });

  return r;
}
