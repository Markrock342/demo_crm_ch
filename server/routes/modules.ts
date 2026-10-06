import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { MODULE_KEYS, MODULE_PRESETS, blockingModule, presetOf, type ModuleSet } from "../domain/modules.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { getOrganizationModules, setOrganizationModules } from "../services/modules.service.js";

/**
 * Off when MODULE_GATE=off, and inside `node --test` runs (older API tests use the seeded demo
 * company, which ships with finance off) unless a test sets MODULE_GATE=on.
 */
function gateOn() {
  const flag = process.env.MODULE_GATE?.trim().toLowerCase();
  if (flag === "off") return false;
  if (flag === "on") return true;
  return !process.env.NODE_TEST_CONTEXT;
}

/** 403 `module_disabled` for API calls that belong to a module the signed-in company has turned off. */
export const moduleGate = createMiddleware<AuthEnv>(async (c, next) => {
  const orgId = c.get("organizationId");
  if (!orgId || !gateOn()) return next();
  const db = getDb();
  if (!db) return next();
  const mods = await getOrganizationModules(db, orgId);
  const blocked = blockingModule(c.req.method, c.req.path, mods);
  if (blocked) return c.json({ error: "module_disabled", module: blocked }, 403);
  return next();
});

const patchSchema = z
  .object({
    preset: z.enum(Object.keys(MODULE_PRESETS) as [keyof typeof MODULE_PRESETS, ...(keyof typeof MODULE_PRESETS)[]]).optional(),
    modules: z.object(Object.fromEntries(MODULE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<keyof ModuleSet, z.ZodOptional<z.ZodBoolean>>).strict().optional(),
  })
  .strict()
  .refine((b) => b.preset || b.modules, { message: "preset_or_modules_required" });

const body = (modules: ModuleSet) => ({ modules, preset: presetOf(modules), keys: MODULE_KEYS });

export function modulesRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  // Every signed-in user reads them (menus); only admins change them.
  r.get("/organization/modules", requireAuth(), requireTenant(), async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    return c.json(body(await getOrganizationModules(db, c.get("organizationId")!)));
  });

  r.patch("/organization/modules", requireAuth(), requireTenant(), requirePermission("user.manage"), async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    }
    const patch: Partial<ModuleSet> = { ...(parsed.data.preset ? MODULE_PRESETS[parsed.data.preset] : {}), ...(parsed.data.modules ?? {}) };
    const { after } = await setOrganizationModules(db, c.get("organizationId")!, c.get("user")!.id, patch);
    return c.json(body(after));
  });

  return r;
}
