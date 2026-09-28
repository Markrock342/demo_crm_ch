import { createMiddleware } from "hono/factory";
import { getDb } from "../db/index.js";
import { hasPermission, type PermissionCode, type RoleCode } from "../domain/rbac.js";
import { readSessionCookie, verifySession, type SessionPayload } from "../lib/jwt.js";
import { loadAuthUser, type AuthUser } from "../services/auth.service.js";
import { resolveSessionOrganization, type TenantContext } from "../services/tenancy.service.js";
import { eq } from "drizzle-orm";
import { users } from "../db/schema/auth.js";
import { isSessionStale } from "../services/users.service.js";

export type AuthEnv = {
  Variables: {
    user: AuthUser | null;
    session: SessionPayload | null;
    tenant: TenantContext | null;
    organizationId: string | null;
  };
};

/**
 * Every router is mounted at "/" and also does `r.use("*", authMiddleware)`, so without a guard the
 * session would be resolved once per router (≈ a dozen times, ~7 queries each) on every request.
 * `resolved` makes it once per request. `authCache` keeps the user's roles + tenant for a few seconds
 * so a screen firing 5 parallel calls loads them once; "is the account still active / was the
 * password changed" is still checked on every request (one PK lookup), so revocation stays instant.
 * Role / membership changes apply within AUTH_CACHE_TTL_MS (default 5000; 0 = no cache).
 */
const resolved = new WeakSet<Request>();
type Resolved = { user: AuthUser | null; tenant: TenantContext | null; at: number };
const authCache = new Map<string, Resolved>();
const AUTH_CACHE_TTL_MS = Math.max(0, Number(process.env.AUTH_CACHE_TTL_MS ?? 5000) || 0);

async function resolveAuth(session: SessionPayload): Promise<Resolved | null> {
  const db = getDb();
  if (!db) return null;
  const userId = session.sub!;
  const [acct] = await db.select({ active: users.active, changedAt: users.passwordChangedAt }).from(users).where(eq(users.id, userId)).limit(1);
  // A password change / admin reset revokes every session issued before it.
  if (!acct?.active || isSessionStale(session.iat, acct.changedAt ?? null)) return { user: null, tenant: null, at: Date.now() };

  const sessionOrgId = typeof session.orgId === "string" ? session.orgId : undefined;
  const key = `${userId}|${sessionOrgId ?? ""}`;
  const now = Date.now();
  const hit = AUTH_CACHE_TTL_MS ? authCache.get(key) : undefined;
  if (hit && now - hit.at < AUTH_CACHE_TTL_MS) return hit;

  const user = await loadAuthUser(db, userId);
  const out: Resolved = user
    ? { user, tenant: await resolveSessionOrganization(db, user.id, sessionOrgId), at: now }
    : { user: null, tenant: null, at: now };
  if (AUTH_CACHE_TTL_MS) {
    if (authCache.size > 5000) authCache.clear();
    authCache.set(key, out);
  }
  return out;
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  if (resolved.has(c.req.raw)) return next();
  resolved.add(c.req.raw);
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
  const auth = await resolveAuth(session);
  if (!auth?.user) {
    c.set("user", null);
    c.set("session", session);
    return next();
  }
  c.set("user", auth.user);
  c.set("session", session);
  c.set("tenant", auth.tenant);
  c.set("organizationId", auth.tenant?.organizationId ?? null);
  return next();
});

/** Drop cached sessions for a user right away (call after password / role / membership changes). */
export function forgetAuth(userId?: string) {
  if (!userId) return authCache.clear();
  for (const k of authCache.keys()) if (k.startsWith(`${userId}|`)) authCache.delete(k);
}

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
