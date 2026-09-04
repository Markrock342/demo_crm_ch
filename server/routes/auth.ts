import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { clearSessionCookie, sessionCookie, signSession } from "../lib/jwt.js";
import { loginUser } from "../services/auth.service.js";
import { writeAudit } from "../services/audit.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function authRoutes() {
  const r = new Hono<AuthEnv>();

  r.use("*", authMiddleware);

  r.post("/login", async (c) => {
    if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);

    let body: z.infer<typeof loginSchema>;
    try {
      body = loginSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }

    const user = await loginUser(db, body.email, body.password);
    if (!user) return c.json({ error: "invalid_credentials" }, 401);

    const { resolvePrimaryOrganization } = await import("../services/tenancy.service.js");
    const tenant = await resolvePrimaryOrganization(db, user.id);
    if (!tenant) return c.json({ error: "no_organization" }, 403);

    const token = await signSession({
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      orgId: tenant.organizationId,
    });

    await writeAudit(db, {
      userId: user.id,
      action: "USER_LOGIN",
      entityType: "user",
      entityId: user.id,
    });

    c.header("Set-Cookie", sessionCookie(token));
    return c.json({
      user: {
        ...user,
        organizationId: tenant.organizationId,
        organizationName: tenant.organizationName,
      },
      tenant,
    });
  });

  r.get("/me", requireAuth(), requireTenant(), (c) => {
    return c.json({ user: c.get("user"), tenant: c.get("tenant") });
  });

  r.post("/logout", async (c) => {
    const user = c.get("user");
    const db = getDb();
    if (db && user) {
      await writeAudit(db, {
        userId: user.id,
        action: "USER_LOGOUT",
        entityType: "user",
        entityId: user.id,
      });
    }
    c.header("Set-Cookie", clearSessionCookie());
    return c.json({ ok: true });
  });

  return r;
}
