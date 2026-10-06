import { existsSync, readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { app } from "./app.js";
import { getDb } from "./db/index.js";
import { runAutomationAllOrgs } from "./services/automation.service.js";

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadDotEnv(".env");

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST?.trim() || "127.0.0.1";

// Long-running server (VPS): gzip API responses, and optionally serve the built SPA from ./dist
// (SERVE_STATIC=1) with precompressed .br/.gz files and long-lived caching for hashed assets.
// On Vercel none of this runs — api/[...path].ts uses server/app.ts directly and the CDN serves dist/.
const root = new Hono();
root.use("/api/*", compress({ threshold: 1024 }));
root.route("/", app);
const staticDir = process.env.STATIC_DIR?.trim() || "dist";
if (process.env.SERVE_STATIC === "1" && existsSync(`${staticDir}/index.html`)) {
  root.use(
    "*",
    serveStatic({
      root: staticDir,
      precompressed: true,
      onFound: (path, c) => {
        // Vite fingerprints everything under /assets → safe to cache for a year.
        c.header("Cache-Control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    }),
  );
  // SPA fallback: unknown non-API paths get index.html (always revalidated so deploys show up).
  root.get("*", serveStatic({ root: staticDir, path: "index.html", precompressed: true, onFound: (_p, c) => void c.header("Cache-Control", "no-cache") }));
}

serve({ fetch: root.fetch, port, hostname }, () => {
  console.log(`cangzhan api http://${hostname}:${port}${process.env.SERVE_STATIC === "1" ? ` (serving ${staticDir}/)` : ""}`);
});

// Automation scheduler for long-running servers. On Vercel the Cron entry in vercel.json
// calls GET /api/cron/automation instead (serverless functions can't keep timers alive).
if (!process.env.VERCEL && process.env.AUTOMATION_SCHEDULER !== "off") {
  const EVERY_MS = 10 * 60 * 1000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const db = getDb();
      if (!db) return;
      const results = await runAutomationAllOrgs(db);
      const created = results.reduce((s, r) => s + r.created, 0);
      if (created) console.log(`[automation] ${created} new notification(s) across ${results.length} org(s)`);
    } catch (e) {
      console.error("[automation] scheduled run failed:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 30_000).unref();
  setInterval(() => void tick(), EVERY_MS).unref();
}
