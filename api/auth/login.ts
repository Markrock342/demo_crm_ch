import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb, hasDatabase } from "../../server/db/index.js";
import { sessionCookie, signSession } from "../../server/lib/jwt.js";
import { loginUser } from "../../server/services/auth.service.js";
import { writeAudit } from "../../server/services/audit.service.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!hasDatabase()) return res.status(503).json({ error: "database_unconfigured" });

  const db = getDb();
  if (!db) return res.status(503).json({ error: "database_unavailable" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const email = String(body?.email ?? "");
  const password = String(body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "invalid_body" });

  const user = await loginUser(db, email, password);
  if (!user) return res.status(401).json({ error: "invalid_credentials" });

  const token = await signSession({
    sub: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
  });

  await writeAudit(db, { userId: user.id, action: "USER_LOGIN", entityType: "user", entityId: user.id });

  res.setHeader("Set-Cookie", sessionCookie(token));
  return res.status(200).json({ user });
}

export const config = { runtime: "nodejs" };
