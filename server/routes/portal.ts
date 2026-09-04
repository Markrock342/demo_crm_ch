import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "../db/index.js";
import { customers } from "../db/schema/crm.js";
import { signPortalSession, portalSessionCookie, clearPortalSessionCookie, readPortalSessionCookie, verifyPortalSession } from "../lib/portal-jwt.js";
import { listJobs } from "../services/operations.service.js";
import { listInvoices } from "../services/finance.service.js";
import { listCrmDocs } from "../services/comms.service.js";

export type PortalEnv = {
  Variables: {
    portalCustomerId: string | null;
    portalOrganizationId: string | null;
  };
};

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

export const portalMiddleware = createMiddleware<PortalEnv>(async (c, next) => {
  c.set("portalCustomerId", null);
  c.set("portalOrganizationId", null);
  const token = readPortalSessionCookie(c.req.header("cookie"));
  if (!token) return next();
  const session = await verifyPortalSession(token);
  if (!session?.customerId || !session.orgId) return next();
  c.set("portalCustomerId", session.customerId);
  c.set("portalOrganizationId", session.orgId);
  return next();
});

export function requirePortalSession() {
  return createMiddleware<PortalEnv>(async (c, next) => {
    if (!c.get("portalCustomerId")) return c.json({ error: "unauthorized" }, 401);
    return next();
  });
}

export function portalRoutes() {
  const r = new Hono<PortalEnv>();

  r.post("/login", async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = z
      .object({
        customerId: z.string().min(1),
        pin: z.string().optional(),
      })
      .parse(await c.req.json());

    const [cust] = await db.select().from(customers).where(eq(customers.id, body.customerId)).limit(1);
    if (!cust) return c.json({ error: "invalid_credentials" }, 401);

    const expected = (cust.portalPin ?? "demo").trim() || "demo";
    const pin = (body.pin ?? "").trim();
    if (pin && pin !== expected) return c.json({ error: "invalid_credentials" }, 401);

    const token = await signPortalSession({ customerId: cust.id, orgId: cust.organizationId });
    c.header("Set-Cookie", portalSessionCookie(token));
    return c.json({
      session: { customerId: cust.id, organizationId: cust.organizationId },
    });
  });

  r.post("/logout", (c) => {
    c.header("Set-Cookie", clearPortalSessionCookie());
    return c.json({ ok: true });
  });

  r.get("/me", portalMiddleware, requirePortalSession(), async (c) => {
    const customerId = c.get("portalCustomerId")!;
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const [cust] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!cust) return c.json({ error: "not_found" }, 404);
    return c.json({
      customerId: cust.id,
      nameEn: cust.nameEn,
      nameZh: cust.nameZh,
      organizationId: cust.organizationId,
    });
  });

  r.get("/jobs", portalMiddleware, requirePortalSession(), async (c) => {
    const customerId = c.get("portalCustomerId")!;
    const orgId = c.get("portalOrganizationId")!;
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const rows = await listJobs(db, orgId, customerId);
    return c.json({ items: rows });
  });

  r.get("/invoices", portalMiddleware, requirePortalSession(), async (c) => {
    const customerId = c.get("portalCustomerId")!;
    const orgId = c.get("portalOrganizationId")!;
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listInvoices(db, orgId, customerId) });
  });

  r.get("/docs", portalMiddleware, requirePortalSession(), async (c) => {
    const customerId = c.get("portalCustomerId")!;
    const orgId = c.get("portalOrganizationId")!;
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listCrmDocs(db, orgId, customerId) });
  });

  return r;
}
