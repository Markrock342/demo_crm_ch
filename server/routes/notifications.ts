import { timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import { CHANNELS, isRuleKey, listRules, runAutomation, runAutomationAllOrgs, updateRule } from "../services/automation.service.js";
import { lineConfigured, verifyLineSignature } from "../services/line.service.js";
import {
  createLineLinkCode,
  getLineChannel,
  handleLineEvents,
  listNotifications,
  markAllRead,
  markRead,
  setLineEnabled,
  unlinkLine,
  unreadCount,
} from "../services/notifications.service.js";

function dbOr503(c: Context<AuthEnv>): Db | Response {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

async function parse<T extends z.ZodType>(c: Context<AuthEnv>, schema: T): Promise<{ data: z.infer<T> } | { error: Response }> {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: c.json(
        { error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        400,
      ),
    };
  }
  return { data: parsed.data };
}

const rulePatchSchema = z
  .object({ enabled: z.boolean().optional(), channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length).optional() })
  .strict()
  .refine((v) => v.enabled !== undefined || v.channels !== undefined, { message: "empty_patch" });

const lineEnabledSchema = z.object({ enabled: z.boolean() }).strict();
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const gate = [requireAuth(), requireTenant()] as const;
const adminGate = [requireAuth(), requireTenant(), requirePermission("user.manage")] as const;

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function notificationsRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  // ---- Automation rules --------------------------------------------------

  r.get("/automation/rules", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ items: await listRules(db, c.get("organizationId")!), lineAvailable: lineConfigured() });
  });

  r.patch("/automation/rules/:key", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const key = c.req.param("key");
    if (!isRuleKey(key)) return c.json({ error: "not_found" }, 404);
    const body = await parse(c, rulePatchSchema);
    if ("error" in body) return body.error;
    const user = c.get("user")!;
    const { before, after } = await updateRule(db, c.get("organizationId")!, user.id, key, body.data);
    await writeAudit(db, {
      organizationId: c.get("organizationId"),
      userId: user.id,
      action: "automation_rule.update",
      entityType: "automation_rule",
      entityId: key,
      oldValue: { enabled: before.enabled, channels: before.channels },
      newValue: { enabled: after.enabled, channels: after.channels },
    });
    return c.json({ rule: after });
  });

  r.post("/automation/run", ...adminGate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const result = await runAutomation(db, c.get("organizationId")!);
    await writeAudit(db, {
      userId: c.get("user")!.id,
      action: "automation.run",
      entityType: "automation",
      entityId: c.get("organizationId")!,
      newValue: { created: result.created, lineSent: result.lineSent },
    });
    return c.json({ result, items: await listRules(db, c.get("organizationId")!) });
  });

  /** Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`. */
  r.get("/cron/automation", async (c) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return c.json({ error: "cron_unconfigured" }, 503);
    const auth = c.req.header("authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${secret}`)) return c.json({ error: "unauthorized" }, 401);
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const results = await runAutomationAllOrgs(db);
    return c.json({ ok: true, orgs: results.length, created: results.reduce((s, x) => s + x.created, 0) });
  });

  // ---- My notifications ----------------------------------------------------

  r.get("/notifications", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const before = c.req.query("before");
    const beforeDate = before ? new Date(before) : null;
    const out = await listNotifications(db, c.get("organizationId")!, c.get("user")!.id, {
      unreadOnly: c.req.query("unread") === "1",
      limit: Number(c.req.query("limit") ?? 100) || 100,
      before: beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null,
    });
    return c.json(out);
  });

  r.get("/notifications/unread-count", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ unread: await unreadCount(db, c.get("organizationId")!, c.get("user")!.id) });
  });

  r.post("/notifications/read-all", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const n = await markAllRead(db, c.get("organizationId")!, c.get("user")!.id);
    return c.json({ updated: n, unread: 0 });
  });

  r.post("/notifications/:id/read", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const id = c.req.param("id");
    if (!uuidRe.test(id)) return c.json({ error: "not_found" }, 404);
    const row = await markRead(db, c.get("organizationId")!, c.get("user")!.id, id);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ notification: row, unread: await unreadCount(db, c.get("organizationId")!, c.get("user")!.id) });
  });

  // ---- Channels (LINE) -------------------------------------------------------

  r.get("/notifications/channels", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ line: await getLineChannel(db, c.get("organizationId")!, c.get("user")!.id) });
  });

  r.post("/notifications/channels/line/code", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    if (!lineConfigured()) return c.json({ error: "line_unavailable" }, 409);
    return c.json({ line: await createLineLinkCode(db, c.get("organizationId")!, c.get("user")!.id) });
  });

  r.patch("/notifications/channels/line", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, lineEnabledSchema);
    if ("error" in body) return body.error;
    return c.json({ line: await setLineEnabled(db, c.get("organizationId")!, c.get("user")!.id, body.data.enabled) });
  });

  r.delete("/notifications/channels/line", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const user = c.get("user")!;
    const line = await unlinkLine(db, c.get("organizationId")!, user.id);
    await writeAudit(db, { organizationId: c.get("organizationId"), userId: user.id, action: "notification_channel.unlink", entityType: "notification_channel", entityId: "line" });
    return c.json({ line });
  });

  /** LINE Messaging API webhook — links a LINE user when they send their code to the OA. */
  r.post("/webhooks/line", async (c) => {
    const secret = process.env.LINE_CHANNEL_SECRET?.trim();
    if (!secret || !lineConfigured()) return c.json({ error: "line_unavailable" }, 404);
    const raw = await c.req.text();
    if (!verifyLineSignature(raw, c.req.header("x-line-signature"), secret)) return c.json({ error: "bad_signature" }, 401);
    let payload: { events?: unknown[] };
    try {
      payload = JSON.parse(raw) as { events?: unknown[] };
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const { linked } = await handleLineEvents(
      db,
      (Array.isArray(payload.events) ? payload.events : []) as Parameters<typeof handleLineEvents>[1],
    );
    for (const l of linked) {
      await writeAudit(db, { userId: l.userId, action: "notification_channel.link", entityType: "notification_channel", entityId: "line" });
    }
    return c.json({ ok: true });
  });

  return r;
}
