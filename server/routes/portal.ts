import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { Hono } from "hono";
import { getBranding, logoHeaders } from "../services/branding.service.js";
import { readOrganizationLogo } from "../services/organization.service.js";
import { eq } from "drizzle-orm";
import { getDb, hasDatabase } from "../db/index.js";
import { customers } from "../db/schema/crm.js";
import { signPortalSession, portalSessionCookie, clearPortalSessionCookie, readPortalSessionCookie, verifyPortalSession } from "../lib/portal-jwt.js";
import { listJobs } from "../services/operations.service.js";
import { listInvoices } from "../services/finance.service.js";
import { listCrmDocs } from "../services/comms.service.js";
import { requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import {
  authenticatePortalContact,
  clearPortalLoginFailures,
  issuePortalAccessCode,
  portalLoginBlocked,
  recordPortalLoginFailure,
  revokePortalAccess,
} from "../services/portal-access.service.js";

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
    let body: { email: string; code: string };
    try {
      body = z
        .object({ email: z.string().email().max(200), code: z.string().min(1).max(40) })
        .parse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `${body.email.trim().toLowerCase()}|${ip}`;
    if (portalLoginBlocked(key)) return c.json({ error: "too_many_attempts" }, 429);

    const hit = await authenticatePortalContact(db, body.email, body.code);
    if (!hit) {
      recordPortalLoginFailure(key);
      return c.json({ error: "invalid_credentials" }, 401);
    }
    clearPortalLoginFailures(key);

    const token = await signPortalSession({ customerId: hit.customerId, orgId: hit.orgId });
    c.header("Set-Cookie", portalSessionCookie(token));
    return c.json({
      session: { customerId: hit.customerId, organizationId: hit.orgId },
    });
  });

  // Staff: issue / rotate / revoke a customer's portal access code (plain code returned once).
  const staff = new Hono<AuthEnv>();
  staff.post("/:customerId", requireAuth(), requireTenant(), requirePermission("customer.edit"), async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const res = await issuePortalAccessCode(db, c.get("organizationId")!, c.req.param("customerId"));
    if (!res) return c.json({ error: "not_found" }, 404);
    return c.json(res);
  });
  staff.delete("/:customerId", requireAuth(), requireTenant(), requirePermission("customer.edit"), async (c) => {
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const ok = await revokePortalAccess(db, c.get("organizationId")!, c.req.param("customerId"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });
  r.route("/access-code", staff);

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
      nameTh: cust.nameTh,
      organizationId: cust.organizationId,
      // The freight company's name + logo for the portal header (white-label).
      branding: await getBranding(db, cust.organizationId, "/api/portal/logo"),
    });
  });

  r.get("/logo", portalMiddleware, requirePortalSession(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const logo = await readOrganizationLogo(db, c.get("portalOrganizationId")!);
    if (!logo) return c.json({ error: "not_found" }, 404);
    return new Response(new Uint8Array(logo.bytes), { headers: logoHeaders(logo.mime, "private") });
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
