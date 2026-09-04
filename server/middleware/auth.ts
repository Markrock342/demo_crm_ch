import { createMiddleware } from "hono/factory";
import { getDb } from "../db/index.js";
import { hasPermission, type PermissionCode, type RoleCode } from "../domain/rbac.js";
import { readSessionCookie, verifySession, type SessionPayload } from "../lib/jwt.js";
import { loadAuthUser, type AuthUser } from "../services/auth.service.js";
import { resolveSessionOrganization, type TenantContext } from "../services/tenancy.service.js";

export type AuthEnv = {
  Variables: {
    user: AuthUser | null;
    session: SessionPayload | null;
    tenant: TenantContext | null;
    organizationId: string | null;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  c.set("tenant", null);
  c.set("organizationId", null);

  const token = readSessionCookie(c.req.header("cookie"));
  if (!token) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }
  const session = await verifySession(token);
  if (!session?.sub) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }
  const db = getDb();
  if (!db) {
    c.set("user", null);
    c.set("session", session);
    return next();
  }
  const user = await loadAuthUser(db, session.sub);
  if (!user) {
    c.set("user", null);
    c.set("session", session);
    return next();
  }

  const sessionOrgId = typeof session.orgId === "string" ? session.orgId : undefined;
  const tenant = await resolveSessionOrganization(db, user.id, sessionOrgId);
  c.set("user", user);
  c.set("session", session);
  c.set("tenant", tenant);
  c.set("organizationId", tenant?.organizationId ?? null);
  return next();
});

export function requireAuth() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return next();
  });
}

/** Ensures authenticated user has a resolved tenant (multi-tenant SaaS boundary). */
export function requireTenant() {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const orgId = c.get("organizationId");
    if (!orgId) return c.json({ error: "tenant_required" }, 403);
    return next();
  });
}

export function requirePermission(...perms: PermissionCode[]) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    const ok = perms.some((p) => hasPermission(user.roles as RoleCode[], p));
    if (!ok) return c.json({ error: "forbidden" }, 403);
    return next();
  });
}
