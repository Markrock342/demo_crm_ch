import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../server/db/index.js";
import { clearSessionCookie, readSessionCookie, verifySession } from "../../server/lib/jwt.js";
import { writeAudit } from "../../server/services/audit.service.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const token = readSessionCookie(req.headers.cookie);
  const session = token ? await verifySession(token) : null;
  const db = getDb();

  if (db && session?.sub) {
    await writeAudit(db, {
      userId: session.sub,
      action: "USER_LOGOUT",
      entityType: "user",
      entityId: session.sub,
    });
  }

  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.status(200).json({ ok: true });
}

export const config = { runtime: "nodejs" };
