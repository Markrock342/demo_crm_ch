import { Hono } from "hono";
import { hasDatabase } from "../db/index.js";
import { hasGeminiKey } from "../gemini.js";

export function systemRoutes() {
  const r = new Hono();

  r.get("/health", (c) => {
    return c.json({
      ok: true,
      database: hasDatabase(),
      gemini: hasGeminiKey(),
      mode: hasDatabase() ? "production" : "demo",
    });
  });

  return r;
}
