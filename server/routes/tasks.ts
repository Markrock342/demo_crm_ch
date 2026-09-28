import { Hono, type Context } from "hono";
import { z } from "zod";
import { getDb, hasDatabase, type Db } from "../db/index.js";
import { hasPermission, type RoleCode } from "../domain/rbac.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import {
  ACTIVITY_TYPES,
  TASK_PRIORITIES,
  TaskInputError,
  createActivity,
  createTask,
  deleteActivity,
  deleteTask,
  getTask,
  listActivities,
  listTasks,
  updateTask,
  type TaskActor,
} from "../services/tasks.service.js";

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "invalid_date");
const optId = z.string().trim().max(120).optional().nullable();

const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1, "title_required").max(300),
    notes: z.string().max(4000).optional().nullable(),
    dueAt: isoDate.optional().nullable(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    ownerUserId: z.string().uuid().optional().nullable(),
    customerId: optId,
    jobId: optId,
    containerNo: z.string().trim().max(20).optional().nullable(),
  })
  .strict();

const taskPatchSchema = taskCreateSchema.partial().extend({ status: z.enum(["open", "done"]).optional() }).strict();

const activityCreateSchema = z
  .object({
    type: z.enum(ACTIVITY_TYPES),
    body: z.string().trim().min(1, "body_required").max(4000),
    customerId: optId,
    jobId: optId,
    occurredAt: isoDate.optional().nullable(),
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
  if (e instanceof TaskInputError) {
    return c.json({ error: "invalid_body", issues: [{ path: e.field ?? "", message: e.code }] }, 400);
  }
  throw e;
}

function actorOf(c: Context<AuthEnv>): TaskActor {
  const user = c.get("user")!;
  return { userId: user.id, viewAll: hasPermission(user.roles as RoleCode[], "task.view_all") };
}

const qDate = (v: string | undefined) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const qInt = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

const gate = [requireAuth(), requireTenant()] as const;

export function tasksRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  /**
   * GET /tasks?scope=mine|all&owner=<userId>|none&customerId=&jobId=&status=open|done|all
   *   &dueFrom=&dueTo=&q=&limit=&offset=
   * Everyone sees tasks they own or created; task.view_all sees the whole organization.
   */
  r.get("/tasks", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const q = c.req.query();
    const status = q.status === "done" || q.status === "all" ? q.status : q.status === "open" ? "open" : "all";
    const result = await listTasks(db, c.get("organizationId")!, actorOf(c), {
      scope: q.scope === "all" ? "all" : "mine",
      ownerUserId: q.owner && q.owner !== "none" ? q.owner : undefined,
      unassigned: q.owner === "none",
      customerId: q.customerId || undefined,
      jobId: q.jobId || undefined,
      status,
      dueFrom: qDate(q.dueFrom),
      dueTo: qDate(q.dueTo),
      q: q.q,
      limit: qInt(q.limit),
      offset: qInt(q.offset),
    });
    return c.json(result);
  });

  r.get("/tasks/:id", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const task = await getTask(db, c.get("organizationId")!, actorOf(c), c.req.param("id"));
    if (!task) return c.json({ error: "not_found" }, 404);
    return c.json({ task });
  });

  r.post("/tasks", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, taskCreateSchema);
    if ("error" in body) return body.error;
    try {
      return c.json({ task: await createTask(db, c.get("organizationId")!, actorOf(c), body.data) }, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  r.patch("/tasks/:id", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, taskPatchSchema);
    if ("error" in body) return body.error;
    try {
      const task = await updateTask(db, c.get("organizationId")!, actorOf(c), c.req.param("id"), body.data);
      if (!task) return c.json({ error: "not_found" }, 404);
      return c.json({ task });
    } catch (e) {
      return fail(c, e);
    }
  });

  for (const [path, status] of [
    ["complete", "done"],
    ["reopen", "open"],
  ] as const) {
    r.post(`/tasks/:id/${path}`, ...gate, async (c) => {
      const db = dbOr503(c);
      if (db instanceof Response) return db;
      const task = await updateTask(db, c.get("organizationId")!, actorOf(c), c.req.param("id"), { status });
      if (!task) return c.json({ error: "not_found" }, 404);
      return c.json({ task });
    });
  }

  r.delete("/tasks/:id", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const ok = await deleteTask(db, c.get("organizationId")!, actorOf(c), c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  // ---- Activity log ------------------------------------------------------

  /** GET /activities?customerId=&jobId=&from=&to=&limit=&offset= — newest first. */
  r.get("/activities", ...gate, requirePermission("customer.view", "shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const q = c.req.query();
    return c.json(
      await listActivities(db, c.get("organizationId")!, {
        customerId: q.customerId || undefined,
        jobId: q.jobId || undefined,
        from: qDate(q.from),
        to: qDate(q.to),
        limit: qInt(q.limit),
        offset: qInt(q.offset),
      }),
    );
  });

  r.post("/activities", ...gate, requirePermission("activity.create"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const body = await parse(c, activityCreateSchema);
    if ("error" in body) return body.error;
    try {
      return c.json({ activity: await createActivity(db, c.get("organizationId")!, c.get("user")!.id, body.data) }, 201);
    } catch (e) {
      return fail(c, e);
    }
  });

  r.delete("/activities/:id", ...gate, async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const ok = await deleteActivity(db, c.get("organizationId")!, actorOf(c), c.req.param("id"));
    if (!ok) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  return r;
}
