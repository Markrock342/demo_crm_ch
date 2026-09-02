import { Hono } from "hono";
import { hasGeminiKey } from "./gemini.js";
import { briefRequestSchema, mailRequestSchema } from "./schema.js";

export function createApp() {
  const app = new Hono();

  app.get("/api/ai/health", (c) => {
    return c.json({ ok: hasGeminiKey(), model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash" });
  });

  app.post("/api/ai/mail", async (c) => {
    if (!hasGeminiKey()) return c.json({ error: "missing_key" }, 503);
    try {
      const { analyzeLaneMail } = await import("./analyze.js");
      const body = mailRequestSchema.parse(await c.req.json());
      const result = await analyzeLaneMail(body);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad_request";
      const status = message.includes("invalid") || message.includes("Expected") ? 400 : 502;
      return c.json({ error: message }, status);
    }
  });

  app.post("/api/ai/brief", async (c) => {
    if (!hasGeminiKey()) return c.json({ error: "missing_key" }, 503);
    try {
      const { summarizeFacts } = await import("./analyze.js");
      const body = briefRequestSchema.parse(await c.req.json());
      const result = await summarizeFacts(body);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "bad_request";
      return c.json({ error: message }, 502);
    }
  });

  return app;
}

export const app = createApp();
