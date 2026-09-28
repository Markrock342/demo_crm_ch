import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { hasPermission, type PermissionCode, type RoleCode } from "../domain/rbac.js";
import { IMPORT_ENTITIES, IMPORT_MAX_ROWS, type ImportEntity } from "../../src/lib/importer.js";
import { ImportUndoError, getImportBatch, listImportBatches, runImport, undoImportBatch } from "../services/import.service.js";

/** Who may import (and undo) each entity: the same people who can create it by hand. */
export const IMPORT_PERMISSIONS: Record<ImportEntity, PermissionCode[]> = {
  customers: ["customer.create"],
  contacts: ["customer.edit", "customer.create"],
  rates: ["rate.create"],
  jobs: ["shipment.edit"],
};

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

const tenantGate = [requireAuth(), requireTenant()] as const;

const cell = z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]);
const bodySchema = z.object({
  fileName: z.string().trim().max(300).optional().default(""),
  dryRun: z.boolean().optional().default(false),
  rows: z
    .array(z.object({ row: z.number().int().min(1), data: z.record(z.string().max(64), cell) }))
    .min(1)
    .max(IMPORT_MAX_ROWS),
});

function canImport(roles: RoleCode[], entity: ImportEntity) {
  return IMPORT_PERMISSIONS[entity].some((p) => hasPermission(roles, p));
}

export function importRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.get("/import/batches", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const roles = c.get("user")!.roles as RoleCode[];
    const allowed = IMPORT_ENTITIES.filter((e) => canImport(roles, e));
    if (!allowed.length) return c.json({ error: "forbidden" }, 403);
    const items = (await listImportBatches(db, c.get("organizationId")!)).filter((b) => allowed.includes(b.entity as ImportEntity));
    return c.json({ items });
  });

  r.post("/import/batches/:id/undo", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const orgId = c.get("organizationId")!;
    const batch = await getImportBatch(db, orgId, c.req.param("id"));
    if (!batch) return c.json({ error: "not_found" }, 404);
    if (!canImport(user.roles as RoleCode[], batch.entity as ImportEntity)) return c.json({ error: "forbidden" }, 403);
    try {
      const out = await undoImportBatch(db, orgId, batch.id, user.id);
      return c.json({ ok: true, ...out });
    } catch (e) {
      if (e instanceof ImportUndoError) return c.json({ error: e.code }, e.code === "not_found" ? 404 : 409);
      throw e;
    }
  });

  r.post("/import/:entity", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const entity = c.req.param("entity") as ImportEntity;
    if (!IMPORT_ENTITIES.includes(entity)) return c.json({ error: "not_found" }, 404);
    const user = c.get("user")!;
    if (!canImport(user.roles as RoleCode[], entity)) return c.json({ error: "forbidden" }, 403);
    const raw = await c.req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    }
    const result = await runImport(db, {
      organizationId: c.get("organizationId")!,
      userId: user.id,
      entity,
      fileName: parsed.data.fileName,
      rows: parsed.data.rows,
      dryRun: parsed.data.dryRun,
    });
    return c.json(result, parsed.data.dryRun || !result.batchId ? 200 : 201);
  });

  return r;
}
