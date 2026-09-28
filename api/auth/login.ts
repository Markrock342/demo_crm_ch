import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb, hasDatabase } from "../../server/db/index.js";
import { sessionCookie, signSession } from "../../server/lib/jwt.js";
import { loginUser } from "../../server/services/auth.service.js";
import { writeAudit } from "../../server/services/audit.service.js";
import {
  clearLoginFailures,
  clientIp,
  loginLockKey,
  loginLockRemaining,
  noteStaffLoginFailure,
} from "../../server/services/login-lockout.service.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!hasDatabase()) return res.status(503).json({ error: "database_unconfigured" });

  const db = getDb();
  if (!db) return res.status(503).json({ error: "database_unavailable" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const email = String(body?.email ?? "");
  const password = String(body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "invalid_body" });

  // Same lockout as server/routes/auth.ts (DB-backed, so it holds across serverless instances).
  const ip = clientIp((n) => req.headers[n]);
  const lockKey = loginLockKey(email, ip);
  const wait = await loginLockRemaining(db, lockKey);
  if (wait > 0) {
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({ error: "too_many_attempts", retryAfter: wait });
  }

  const user = await loginUser(db, email, password);
  if (!user) {
    await noteStaffLoginFailure(db, email, ip);
    return res.status(401).json({ error: "invalid_credentials" });
  }
  await clearLoginFailures(db, lockKey);

  const { resolvePrimaryOrganization } = await import("../../server/services/tenancy.service.js");
  const tenant = await resolvePrimaryOrganization(db, user.id);
  if (!tenant) return res.status(403).json({ error: "no_organization" });

  const token = await signSession({
    sub: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
    orgId: tenant.organizationId,
  });

  await writeAudit(db, { userId: user.id, action: "USER_LOGIN", entityType: "user", entityId: user.id });

  res.setHeader("Set-Cookie", sessionCookie(token));
  return res.status(200).json({
    user: { ...user, organizationId: tenant.organizationId, organizationName: tenant.organizationName },
    tenant,
  });
}

export const config = { runtime: "nodejs" };
