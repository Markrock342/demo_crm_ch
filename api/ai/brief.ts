import { summarizeFacts } from "../../server/analyze.js";
import { hasGeminiKey } from "../../server/gemini.js";
import { briefRequestSchema } from "../../server/schema.js";

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!hasGeminiKey()) {
    return Response.json({ error: "missing_key" }, { status: 503 });
  }
  try {
    const body = briefRequestSchema.parse(await req.json());
    const result = await summarizeFacts(body);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad_request";
    return Response.json({ error: message }, { status: 502 });
  }
}

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};
