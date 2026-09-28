import { Hono, type Context } from "hono";
import { z } from "zod";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import type { RoleCode } from "../domain/rbac.js";
import { requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import {
  createRateSheetWithLane,
  getRateLaneForOrg,
  searchRates,
  updateRateLane,
  vendorInOrg,
} from "../services/rate.service.js";

/**
 * Tenant-scoped rate endpoints. Mounted BEFORE commercialRoutes in app.ts, so these handle
 * /rates/search, /rates/lanes/:id and POST /rates (the older unscoped handlers there are shadowed).
 */

const tenantGate = [requireAuth(), requireTenant()] as const;

function dbOr503(c: Context<AuthEnv>): Db | Response {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

const orgId = (c: Context<AuthEnv>) => c.get("organizationId")!;
const roles = (c: Context<AuthEnv>) => (c.get("user")?.roles ?? []) as RoleCode[];

const price = z.union([z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/)]).transform(String);
const currency = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase());
const port = z.string().trim().regex(/^[A-Za-z]{5}$/).transform((s) => s.toUpperCase());
const date = z.string().trim().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date");
const text = (max: number) => z.string().trim().min(1).max(max);

const chargeSchema = z.object({
  chargeCode: z.string().trim().regex(/^[A-Z0-9_]{2,32}$/),
  description: z.string().trim().max(200).default(""),
  side: z.enum(["BUY", "SELL"]),
  unit: z.enum(["PER_CONTAINER", "PER_BL", "PER_SHIPMENT", "PER_CBM", "PER_KG"]),
  quantity: price.default("1"),
  unitPrice: price,
  currency,
});
const charges = z.array(chargeSchema).min(1).max(30);

const createSchema = z
  .object({
    vendorId: text(64),
    name: z.string().trim().max(200).optional(),
    carrier: z.string().trim().max(120).optional(),
    validFrom: date,
    validUntil: date,
    currency,
    lane: z.object({
      origin: z.string().trim().max(120).optional(),
      destination: z.string().trim().max(120).optional(),
      pol: port,
      pod: port,
      mode: z.enum(["SEA_FCL", "SEA_LCL", "AIR", "TRUCK"]).default("SEA_FCL"),
      containerType: z.string().trim().max(10).optional(),
    }),
    charges,
  })
  .refine((b) => Date.parse(b.validUntil) >= Date.parse(b.validFrom), { path: ["validUntil"], message: "must be on or after validFrom" })
  .refine((b) => b.lane.pol !== b.lane.pod, { path: ["lane", "pod"], message: "must differ from pol" });

const patchSchema = z
  .object({
    vendorId: text(64).optional(),
    name: z.string().trim().max(200).optional(),
    carrier: z.string().trim().max(120).nullable().optional(),
    validFrom: date.optional(),
    validUntil: date.optional(),
    currency: currency.optional(),
    containerType: z.string().trim().max(10).nullable().optional(),
    charges: charges.optional(),
    expire: z.literal(true).optional(),
  })
  .strict();

async function parse<T extends z.ZodType>(c: Context<AuthEnv>, schema: T): Promise<{ data: z.output<T> } | { error: Response }> {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: c.json({ error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400),
    };
  }
  return { data: parsed.data };
}

export function ratesRoutes() {
  const r = new Hono<AuthEnv>();

  r.get("/rates/search", ...tenantGate, requirePermission("rate.view_sell"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const items = await searchRates(db, {
      origin: c.req.query("origin"),
      destination: c.req.query("destination"),
      pol: c.req.query("pol"),
      pod: c.req.query("pod"),
      mode: c.req.query("mode"),
      containerType: c.req.query("containerType"),
      roles: roles(c),
      organizationId: orgId(c),
      includeUpcoming: true,
    });
    return c.json({ items });
  });

  r.get("/rates/lanes/:id", ...tenantGate, requirePermission("rate.view_sell"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const row = await getRateLaneForOrg(db, orgId(c), c.req.param("id"), roles(c));
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  r.post("/rates", ...tenantGate, requirePermission("rate.create"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, createSchema);
    if ("error" in body) return body.error;
    const b = body.data;
    if (!(await vendorInOrg(db, orgId(c), b.vendorId))) return c.json({ error: "vendor_not_found" }, 404);
    const name = b.name || `${b.carrier || "Rate"} ${b.lane.pol}-${b.lane.pod}${b.lane.containerType ? ` ${b.lane.containerType}` : ""}`;
    const result = await createRateSheetWithLane(db, {
      vendorId: b.vendorId,
      name,
      carrier: b.carrier || undefined,
      validFrom: new Date(b.validFrom),
      validUntil: new Date(b.validUntil),
      currency: b.currency,
      lane: {
        origin: b.lane.origin || b.lane.pol,
        destination: b.lane.destination || b.lane.pod,
        pol: b.lane.pol,
        pod: b.lane.pod,
        mode: b.lane.mode,
        containerType: b.lane.containerType || undefined,
      },
      charges: b.charges,
    });
    await writeAudit(db, { organizationId: orgId(c), userId: c.get("user")!.id, action: "RATE_CREATED", entityType: "rate_lane", entityId: result.laneId, newValue: { ...result, ...b, name } });
    return c.json(result, 201);
  });

  r.patch("/rates/lanes/:id", ...tenantGate, requirePermission("rate.edit"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, patchSchema);
    if ("error" in body) return body.error;
    const b = body.data;
    if (b.vendorId && !(await vendorInOrg(db, orgId(c), b.vendorId))) return c.json({ error: "vendor_not_found" }, 404);
    try {
      const res = await updateRateLane(db, orgId(c), c.req.param("id"), {
        ...b,
        validFrom: b.validFrom ? new Date(b.validFrom) : undefined,
        validUntil: b.validUntil ? new Date(b.validUntil) : undefined,
      });
      if (!res) return c.json({ error: "not_found" }, 404);
      await writeAudit(db, {
        organizationId: orgId(c),
        userId: c.get("user")!.id,
        action: b.expire ? "RATE_EXPIRED" : "RATE_UPDATED",
        entityType: "rate_lane",
        entityId: res.laneId,
        oldValue: res.before,
        newValue: b,
      });
      return c.json({ laneId: res.laneId, sheetId: res.sheetId });
    } catch (e) {
      if (e instanceof Error && e.message === "valid_range") {
        return c.json({ error: "invalid_body", issues: [{ path: "validUntil", message: "must be on or after validFrom" }] }, 400);
      }
      throw e;
    }
  });

  return r;
}
