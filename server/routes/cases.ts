import { Hono, type Context } from "hono";
import { z } from "zod";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import { CASE_CATEGORIES, CASE_CHANNELS, CASE_PRIORITIES, CASE_STATUSES, type CasePriority } from "../domain/cases.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import {
  CaseInputError,
  addCaseNote,
  caseStats,
  createCanned,
  createCase,
  deleteCanned,
  deleteCase,
  getCase,
  getSlaPolicy,
  listCanned,
  listCases,
  lookupShipments,
  renderCannedForCase,
  replyToCase,
  setSlaPolicy,
  updateCanned,
  updateCase,
  type CaseActor,
} from "../services/case.service.js";

const optId = z.string().trim().max(120).optional().nullable();

const caseCreateSchema = z
  .object({
    subject: z.string().trim().min(1, "subject_required").max(300),
    description: z.string().max(8000).optional().nullable(),
    channel: z.enum(CASE_CHANNELS).optional(),
    category: z.enum(CASE_CATEGORIES).optional(),
    priority: z.enum(CASE_PRIORITIES).optional(),
    customerId: optId,
    contactId: optId,
    assigneeUserId: z.string().uuid().optional().nullable(),
    jobId: optId,
    containerNo: z.string().trim().max(20).optional().nullable(),
    bookingId: optId,
    sourceMailId: optId,
  })
  .strict();

const casePatchSchema = caseCreateSchema
  .omit({ sourceMailId: true })
  .partial()
  .extend({ status: z.enum(CASE_STATUSES).optional() })
  .strict();

const noteSchema = z.object({ body: z.string().trim().min(1, "body_required").max(8000) }).strict();

const replySchema = z
  .object({
    via: z.enum(["email", "phone", "line"]).default("email"),
    body: z.string().trim().min(1, "body_required").max(20000),
    to: z.array(z.string().trim().max(254)).max(20).optional(),
    cc: z.array(z.string().trim().max(254)).max(20).optional(),
    subject: z.string().trim().max(300).optional(),
    status: z.enum(CASE_STATUSES).optional(),
  })
  .strict();

const cannedSchema = z
  .object({
    title: z.string().trim().min(1, "title_required").max(120),
    body: z.string().trim().min(1, "body_required").max(8000),
    category: z.enum(CASE_CATEGORIES).optional().nullable(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

const renderSchema = z
  .object({
    caseId: z.string().trim().min(1).max(120),
    cannedId: z.string().trim().max(120).optional(),
    body: z.string().max(8000).optional(),
    lang: z.enum(["th", "en", "zh"]).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.cannedId || v.body), { message: "canned_or_body_required", path: ["cannedId"] });

const slaTarget = z.object({
  firstResponseMinutes: z.number().int().min(5).max(60 * 24 * 30),
  resolveMinutes: z.number().int().min(5).max(60 * 24 * 90),
});
const slaSchema = z
  .object(Object.fromEntries(CASE_PRIORITIES.map((p) => [p, slaTarget.optional()])) as Record<CasePriority, z.ZodOptional<typeof slaTarget>>)
  .strict()
  .refine((v) => Object.values(v).every((t) => !t || t.resolveMinutes >= t.firstResponseMinutes), { message: "resolve_before_first_response" });

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
  if (e instanceof CaseInputError) {
    return c.json({ error: "invalid_body", issues: [{ path: e.field ?? "", message: e.code }] }, 400);
  }
  throw e;
}

const actorOf = (c: Context<AuthEnv>): CaseActor => ({ userId: c.get("user")!.id });
const org = (c: Context<AuthEnv>) => c.get("organizationId")!;
const qInt = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
const oneOf = <T extends string>(list: readonly T[], v: string | undefined): T | undefined =>
  v && (list as readonly string[]).includes(v) ? (v as T) : undefined;

const gate = [requireAuth(), requireTenant()] as const;
const canView = requirePermission("case.view");
const canEdit = requirePermission("case.edit");
const canManage = requirePermission("case.manage");

export function casesRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  /**
   * GET /cases?status=open|board|all|<status>&assignee=mine|unassigned|all|<userId>&priority=&category=
   *   &customerId=&jobId=&overdue=1&q=&limit=&offset=
   * → { items, total, limit, offset, counts: { <status>: n } } (counts ignore the status filter)
   */
  r.get("/cases", ...gate, canView, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const q = c.req.query();
    const status = q.status === "open" || q.status === "board" || q.status === "all" ? q.status : oneOf(CASE_STATUSES, q.status);
    return c.json(
      await listCases(db, org(c), actorOf(c), {
        status: status ?? "all",
        assignee: q.assignee || undefined,
        priority: oneOf(CASE_PRIORITIES, q.priority),
        category: oneOf(CASE_CATEGORIES, q.category),
        customerId: q.customerId || undefined,
        jobId: q.jobId || undefined,
        overdue: q.overdue === "1" || q.overdue === "true",
        q: q.q,
        limit: qInt(q.limit),
        offset: qInt(q.offset),
      }),
    );
  });

  r.get("/cases/stats", ...gate, canView, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json(await caseStats(db, org(c), actorOf(c)));
  });

  /** GET /cases/lookup?q= — container / job / booking status for answering customers. */
  r.get("/cases/lookup", ...gate, canView, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ items: await lookupShipments(db, org(c), c.req.query("q") ?? "") });
  });

  r.get("/cases/sla", ...gate, canView, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ policy: await getSlaPolicy(db, org(c)) });
  });

  r.put("/cases/sla", ...gate, canManage, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, slaSchema);
    if ("error" in body) return body.error;
    return c.json({ policy: await setSlaPolicy(db, org(c), actorOf(c).userId, body.data) });
  });

  // ---- canned replies ------------------------------------------------------

  r.get("/cases/canned", ...gate, canView, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    return c.json({ items: await listCanned(db, org(c)) });
  });

  r.post("/cases/canned", ...gate, canManage, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, cannedSchema);
    if ("error" in body) return body.error;
    return c.json({ item: await createCanned(db, org(c), actorOf(c).userId, body.data) }, 201);
  });

  r.patch("/cases/canned/:id", ...gate, canManage, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, cannedSchema.partial().strict());
    if ("error" in body) return body.error;
    const item = await updateCanned(db, org(c), actorOf(c).userId, c.req.param("id"), body.data);
    if (!item) return c.json({ error: "not_found" }, 404);
    return c.json({ item });
  });

  r.delete("/cases/canned/:id", ...gate, canManage, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const ok = await deleteCanned(db, org(c), actorOf(c).userId, c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  /** POST /cases/canned/render { caseId, cannedId | body, lang } → { text, missing, values } */
  r.post("/cases/canned/render", ...gate, canView, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, renderSchema);
    if ("error" in body) return body.error;
    const out = await renderCannedForCase(db, org(c), actorOf(c), body.data.caseId, body.data, body.data.lang ?? "th");
    if (!out) return c.json({ error: "not_found" }, 404);
    return c.json(out);
  });

  // ---- cases -----------------------------------------------------------------

  r.post("/cases", ...gate, canEdit, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, caseCreateSchema);
    if ("error" in body) return body.error;
    try {
      return c.json({ case: await createCase(db, org(c), actorOf(c), body.data) }, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  r.get("/cases/:id", ...gate, canView, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const out = await getCase(db, org(c), c.req.param("id"));
    if (!out) return c.json({ error: "not_found" }, 404);
    return c.json(out);
  });

  r.patch("/cases/:id", ...gate, canEdit, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, casePatchSchema);
    if ("error" in body) return body.error;
    try {
      const kase = await updateCase(db, org(c), actorOf(c), c.req.param("id"), body.data);
      if (!kase) return c.json({ error: "not_found" }, 404);
      return c.json({ case: kase });
    } catch (e) {
      return fail(c, e);
    }
  });

  r.delete("/cases/:id", ...gate, canManage, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const ok = await deleteCase(db, org(c), actorOf(c), c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  r.post("/cases/:id/notes", ...gate, canEdit, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, noteSchema);
    if ("error" in body) return body.error;
    const event = await addCaseNote(db, org(c), actorOf(c), c.req.param("id"), body.data.body);
    if (!event) return c.json({ error: "not_found" }, 404);
    return c.json({ event }, 201);
  });

  /** POST /cases/:id/reply { via: email|phone|line, body, to?, cc?, subject?, status? } */
  r.post("/cases/:id/reply", ...gate, canEdit, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, replySchema);
    if ("error" in body) return body.error;
    try {
      const out = await replyToCase(db, org(c), actorOf(c), c.req.param("id"), body.data);
      if (!out) return c.json({ error: "not_found" }, 404);
      return c.json(out, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  return r;
}
