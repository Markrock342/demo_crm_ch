import { analyzeLaneMail } from "../../server/analyze.js";
import { hasGeminiKey } from "../../server/gemini.js";
import { mailRequestSchema } from "../../server/schema.js";

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!hasGeminiKey()) {
    return Response.json({ error: "missing_key" }, { status: 503 });
  }
  try {
    const body = mailRequestSchema.parse(await req.json());
    const result = await analyzeLaneMail(body);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad_request";
    const status = message.includes("invalid") || message.includes("Expected") ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};
