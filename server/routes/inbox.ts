import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import { caseEvents } from "../db/schema/cases.js";
import { readObject } from "../lib/storage.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { UNIT_COLORS, createBusinessUnit, listBusinessUnits, updateBusinessUnit } from "../services/business-unit.service.js";
import { CaseInputError } from "../services/case.service.js";
import {
  LineInputError,
  createLineChannel,
  deleteLineChannel,
  handleLineWebhook,
  listLineChannels,
  simulateLineMessage,
  updateLineChannel,
} from "../services/line-inbox.service.js";

/** Business units (ธุรกิจในเครือ) and the LINE inbox (company OAs → cases). */

const unitSchema = z
  .object({
    name: z.string().trim().min(1, "name_required").max(80),
    color: z.enum(UNIT_COLORS).nullable().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();
const unitPatchSchema = unitSchema.partial().extend({ archived: z.boolean().optional() }).strict();

const secret = z.string().trim().max(400).nullable().optional();
const channelSchema = z
  .object({
    name: z.string().trim().max(80).optional(),
    basicId: z.string().trim().max(40).nullable().optional(),
    channelSecret: secret,
    accessToken: secret,
    businessUnitId: z.string().trim().max(120).nullable().optional(),
    ackMessage: z.string().trim().max(1000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

const testMessageSchema = z
  .object({
    name: z.string().trim().min(1, "name_required").max(80),
    text: z.string().trim().min(1, "text_required").max(2000),
  })
  .strict();

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

function fail(c: Context<AuthEnv>, e: unknown) {
  if (e instanceof LineInputError || e instanceof CaseInputError) {
    return c.json({ error: "invalid_body", issues: [{ path: e.field ?? "", message: e.code }] }, 400);
  }
  throw e;
}

const org = (c: Context<AuthEnv>) => c.get("organizationId")!;
const uid = (c: Context<AuthEnv>) => c.get("user")!.id;
const gate = [requireAuth(), requireTenant()] as const;

export function inboxRoutes() {
  const r = new Hono<AuthEnv>();

  /** LINE → us. Public; each OA has its own unguessable URL and is checked with its own channel secret. */
  r.post("/webhooks/line/:key", async (c) => {
    if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const raw = await c.req.text();
    const out = await handleLineWebhook(db, c.req.param("key"), raw, c.req.header("x-line-signature"));
    if (out.status !== 200) return c.json({ error: out.error }, out.status);
    return c.json({ ok: true });
  });

  r.use("*", authMiddleware);

  // ---- business units --------------------------------------------------------

  r.get("/business-units", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ items: await listBusinessUnits(db, org(c), c.req.query("all") === "1") });
  });

  r.post("/business-units", ...gate, requirePermission("user.manage"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, unitSchema);
    if ("error" in body) return body.error;
    return c.json({ item: await createBusinessUnit(db, org(c), uid(c), body.data) }, 201);
  });

  r.patch("/business-units/:id", ...gate, requirePermission("user.manage"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, unitPatchSchema);
    if ("error" in body) return body.error;
    const item = await updateBusinessUnit(db, org(c), uid(c), c.req.param("id"), body.data);
    if (!item) return c.json({ error: "not_found" }, 404);
    return c.json({ item });
  });

  // ---- LINE channels (OAs) -----------------------------------------------------

  r.get("/cases/line/channels", ...gate, requirePermission("case.view"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ items: await listLineChannels(db, org(c)) });
  });

  r.post("/cases/line/channels", ...gate, requirePermission("case.manage"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, channelSchema);
    if ("error" in body) return body.error;
    try {
      return c.json({ item: await createLineChannel(db, org(c), uid(c), body.data) }, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  r.patch("/cases/line/channels/:id", ...gate, requirePermission("case.manage"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, channelSchema);
    if ("error" in body) return body.error;
    try {
      const item = await updateLineChannel(db, org(c), uid(c), c.req.param("id"), body.data);
      if (!item) return c.json({ error: "not_found" }, 404);
      return c.json({ item });
    } catch (e) {
      return fail(c, e);
    }
  });

  r.delete("/cases/line/channels/:id", ...gate, requirePermission("case.manage"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const ok = await deleteLineChannel(db, org(c), uid(c), c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  /** POST /cases/line/channels/:id/test-message { name, text } → { caseId, caseNo, created } — as if a customer chatted. */
  r.post("/cases/line/channels/:id/test-message", ...gate, requirePermission("case.manage"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, testMessageSchema);
    if ("error" in body) return body.error;
    const out = await simulateLineMessage(db, org(c), uid(c), c.req.param("id"), body.data);
    if (!out) return c.json({ error: "not_found" }, 404);
    return c.json(out, 201);
  });

  /** GET /cases/:id/media/:eventId — a picture / file the customer sent on LINE. */
  r.get("/cases/:id/media/:eventId", ...gate, requirePermission("case.view"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const [ev] = await db
      .select({ data: caseEvents.data })
      .from(caseEvents)
      .where(and(eq(caseEvents.id, c.req.param("eventId")), eq(caseEvents.caseId, c.req.param("id")), eq(caseEvents.organizationId, org(c))))
      .limit(1);
    const media = ev?.data?.media as { key?: string; mime?: string } | undefined;
    if (!media?.key) return c.json({ error: "not_found" }, 404);
    const data = await readObject(org(c), media.key);
    if (!data) return c.json({ error: "not_found" }, 404);
    const mime = media.mime ?? "application/octet-stream";
    // Only raster images render inline; everything else downloads (no HTML / SVG in our origin).
    const inline = /^image\/(jpeg|png|gif|webp)$/.test(mime);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": inline ? mime : "application/octet-stream",
        "Content-Disposition": inline ? "inline" : `attachment; filename="${media.key}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  });

  return r;
}
