import type { VercelRequest, VercelResponse } from "@vercel/node";
import { hasDatabase } from "../server/db/index.js";
import { hasGeminiKey } from "../server/gemini.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    database: hasDatabase(),
    gemini: hasGeminiKey(),
    mode: hasDatabase() ? "production" : "demo",
  });
}

export const config = { runtime: "nodejs" };
