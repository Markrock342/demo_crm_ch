import { Hono } from "hono";
import { hasGeminiKey } from "./gemini.js";
import { authMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { commercialRoutes, publicQuoteRoutes } from "./routes/commercial.js";
import { crmRoutes } from "./routes/crm.js";
import { systemRoutes } from "./routes/system.js";
import { briefRequestSchema, mailRequestSchema } from "./schema.js";

export function createApp() {
  const app = new Hono().basePath("/api");

  app.use("*", authMiddleware);

  app.route("/", systemRoutes());
  app.route("/auth", authRoutes());
  app.route("/", crmRoutes());
  app.route("/", commercialRoutes());
  app.route("/public", publicQuoteRoutes());

  app.get("/ai/health", (c) => {
    return c.json({ ok: hasGeminiKey(), model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash" });
  });

  app.post("/ai/mail", async (c) => {
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

  app.post("/ai/brief", async (c) => {
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
