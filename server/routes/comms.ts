import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, type AuthEnv } from "../middleware/auth.js";
import {
  createMail,
  getMail,
  listCrmDocs,
  listMails,
  mailTransitionAllowed,
  updateCrmDocStatus,
  updateMail,
  upsertCrmDoc,
} from "../services/comms.service.js";

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

const mailPatchSchema = z.object({
  customerId: z.string().optional(),
  from: z.string().optional(),
  subjectZh: z.string().optional(),
  subjectTh: z.string().optional(),
  subjectEn: z.string().optional(),
  bodyZh: z.string().optional(),
  bodyTh: z.string().optional(),
  bodyEn: z.string().optional(),
  draftZh: z.string().optional(),
  draftTh: z.string().optional(),
  draftEn: z.string().optional(),
  time: z.string().optional(),
  confidence: z.number().optional(),
  unread: z.boolean().optional(),
  state: z.enum(["open", "sent", "rejected"]).optional(),
  intent: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  dest: z.string().nullable().optional(),
  extractedBoxes: z.array(z.string()).optional(),
  docsMissing: z.array(z.string()).optional(),
  suggestedStatus: z.string().nullable().optional(),
  needsHuman: z.boolean().optional(),
});

export function commsRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.get("/mails", requireAuth(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listMails(db, c.req.query("customerId")) });
  });

  r.post("/mails", requireAuth(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = z
      .object({
        id: z.string().optional(),
        customerId: z.string().default(""),
        from: z.string().default(""),
        subjectZh: z.string().default(""),
        subjectTh: z.string().default(""),
        subjectEn: z.string().default(""),
        bodyZh: z.string().default(""),
        bodyTh: z.string().default(""),
        bodyEn: z.string().default(""),
        draftZh: z.string().default(""),
        draftTh: z.string().default(""),
        draftEn: z.string().default(""),
        time: z.string().default(""),
        confidence: z.number().default(0),
        unread: z.boolean().default(true),
        state: z.enum(["open", "sent", "rejected"]).default("open"),
        intent: z.string().optional(),
        summary: z.string().optional(),
        origin: z.string().optional(),
        dest: z.string().optional(),
        extractedBoxes: z.array(z.string()).optional(),
        docsMissing: z.array(z.string()).optional(),
        suggestedStatus: z.string().optional(),
        needsHuman: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const row = await createMail(db, body);
    return c.json(row, 201);
  });

  r.patch("/mails/:id", requireAuth(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const id = c.req.param("id");
    const patch = mailPatchSchema.parse(await c.req.json());
    const existing = await getMail(db, id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (patch.state && !mailTransitionAllowed(existing.state, patch.state)) {
      return c.json({ error: "invalid_status" }, 409);
    }
    const row = await updateMail(db, id, {
      ...patch,
      intent: patch.intent ?? undefined,
      summary: patch.summary ?? undefined,
      origin: patch.origin ?? undefined,
      dest: patch.dest ?? undefined,
      suggestedStatus: patch.suggestedStatus ?? undefined,
    });
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  r.get("/docs", requireAuth(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listCrmDocs(db, c.req.query("customerId")) });
  });

  r.patch("/docs/:id", requireAuth(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = z
      .object({
        status: z.enum(["ok", "wait", "late"]),
        updated: z.string().optional(),
      })
      .parse(await c.req.json());
    const stamp =
      body.updated ??
      `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const row = await updateCrmDocStatus(db, c.req.param("id"), body.status, stamp);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  r.post("/docs", requireAuth(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = z
      .object({
        id: z.string(),
        customerId: z.string(),
        boxId: z.string(),
        kind: z.enum(["BL", "CO", "PL", "CI", "BOOK"]),
        name: z.string(),
        status: z.enum(["ok", "wait", "late"]),
        updated: z.string(),
      })
      .parse(await c.req.json());
    return c.json(await upsertCrmDoc(db, body), 201);
  });

  return r;
}
