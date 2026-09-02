import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeLaneMail } from "../../server/analyze.js";
import { hasGeminiKey } from "../../server/gemini.js";
import { mailRequestSchema } from "../../server/schema.js";

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
    const body = mailRequestSchema.parse(req.body);
    const result = await analyzeLaneMail(body);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad_request";
    const status = message.includes("invalid") || message.includes("Expected") ? 400 : 502;
    res.status(status).json({ error: message });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};
