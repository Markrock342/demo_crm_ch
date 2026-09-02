import type { VercelRequest, VercelResponse } from "@vercel/node";
import { summarizeFacts } from "../../server/analyze.js";
import { hasGeminiKey } from "../../server/gemini.js";
import { briefRequestSchema } from "../../server/schema.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!hasGeminiKey()) {
    res.status(503).json({ error: "missing_key" });
    return;
  }
  try {
    const body = briefRequestSchema.parse(req.body);
    const result = await summarizeFacts(body);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad_request";
    res.status(502).json({ error: message });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};
