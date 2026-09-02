import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb, hasDatabase } from "../../server/db/index.js";
import { readSessionCookie, verifySession } from "../../server/lib/jwt.js";
import { loadAuthUser } from "../../server/services/auth.service.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!hasDatabase()) return res.status(200).json({ user: null, mode: "demo" });

  const token = readSessionCookie(req.headers.cookie);
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const session = await verifySession(token);
  if (!session?.sub) return res.status(401).json({ error: "unauthorized" });

  const db = getDb();
  if (!db) return res.status(503).json({ error: "database_unavailable" });

  const user = await loadAuthUser(db, session.sub);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  return res.status(200).json({ user });
}

export const config = { runtime: "nodejs" };
