import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, requireAuth, requirePermission, type AuthEnv } from "../middleware/auth.js";

/** Deterministic mock — mirrors client tracking.mock */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const CYCLE = ["gate_in", "loaded", "in_transit", "arrived", "customs", "do_ready", "delivered"] as const;

export function trackingRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.post("/tracking/refresh", requireAuth(), requirePermission("shipment.view"), async (c) => {
    const body = z
      .object({
        containerNo: z.string().min(1),
        bl: z.string().optional(),
        currentEta: z.string().optional(),
      })
      .parse(await c.req.json());
    const h = hash(body.containerNo + (body.bl || ""));
    const status = CYCLE[h % CYCLE.length]!;
    const dayShift = (h % 5) + 1;
    const base = body.currentEta && body.currentEta !== "—" ? new Date(body.currentEta) : new Date();
    if (Number.isNaN(base.getTime())) base.setTime(Date.now());
    const etaDate = new Date(base.getTime() + dayShift * 86400000);
    const eta = etaDate.toISOString().slice(0, 10);
    const lfd = new Date(etaDate.getTime() + 5 * 86400000).toISOString().slice(0, 10);
    return c.json({
      containerNo: body.containerNo,
      status,
      eta,
      vessel: `MOCK-${(h % 90) + 10}`,
      carrier: h % 2 === 0 ? "COSCO" : "MSC",
      lastFreeDay: lfd,
      provider: "mock",
      events: [{ at: new Date().toISOString(), code: status, note: "mock refresh" }],
    });
  });

  return r;
}
