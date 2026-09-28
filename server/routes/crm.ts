import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { contactInputSchema, customerCreateSchema, customerPatchSchema } from "../domain/customer.js";
import { writeAudit } from "../services/audit.service.js";
import {
  createContact,
  createCustomer,
  CustomerInputError,
  deleteContact,
  createLead,
  createOpportunity,
  getCustomer,
  listContacts,
  listCustomers,
  listLeads,
  listOpportunities,
  updateContact,
  updateCustomer,
  updateLeadStage,
  updateOpportunityStage,
} from "../services/crm.service.js";

const contactCreateSchema = contactInputSchema.omit({ id: true }).extend({ customerId: z.string().min(1) });
const contactPatchSchema = contactInputSchema.omit({ id: true }).partial();

type Issue = { path: string; message: string };
/** Parse JSON with a zod schema → data + which top-level keys were sent, or a 400 with field issues. */
async function parseJson<T extends z.ZodType>(c: { req: { json: () => Promise<unknown> } }, schema: T) {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((i): Issue => ({ path: i.path.join("."), message: i.message })) };
  }
  const keys = new Set(raw && typeof raw === "object" ? Object.keys(raw as object) : []);
  return { data: parsed.data as z.infer<T>, present: (k: string) => keys.has(k) };
}

function inputError(c: { json: (b: unknown, s?: number) => Response }, e: unknown) {
  if (e instanceof CustomerInputError) {
    return c.json({ error: "invalid_body", issues: [{ path: e.field ?? "", message: e.code }] }, 400);
  }
  throw e;
}

const leadCreateSchema = z.object({
  company: z.string().min(1),
  city: z.string().min(1),
  lane: z.string().min(1),
  contact: z.string().min(1),
  source: z.string().min(1),
  teu: z.number().int().nonnegative(),
  owner: z.string().min(1),
});

const opportunityCreateSchema = z.object({
  customerId: z.string().min(1),
  title: z.string().min(1),
  lane: z.string().min(1),
  value: z.number().int().nonnegative(),
  teu: z.number().int().nonnegative(),
  close: z.string().min(1),
  owner: z.string().min(1),
});

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

const tenantGate = [requireAuth(), requireTenant()] as const;

function orgId(c: { get: (k: "organizationId") => string | null }) {
  return c.get("organizationId")!;
}

export function crmRoutes() {
  const r = new Hono<AuthEnv>();

  r.use("*", authMiddleware);

  r.get("/customers", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const q = c.req.query("q");
    const limit = Number(c.req.query("limit") ?? 100);
    const offset = Number(c.req.query("offset") ?? 0);
    const result = await listCustomers(db, orgId(c), { q, limit, offset });
    return c.json(result);
  });

  r.get("/customers/:id", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const row = await getCustomer(db, orgId(c), c.req.param("id"));
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ ...row, contacts: await listContacts(db, orgId(c), row.id) });
  });

  r.post("/customers", ...tenantGate, requirePermission("customer.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const parsed = await parseJson(c, customerCreateSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    let row;
    try {
      row = await createCustomer(db, orgId(c), parsed.data, parsed.present);
    } catch (e) {
      return inputError(c, e);
    }
    const people = await listContacts(db, orgId(c), row.id);
    await writeAudit(db, {
      userId: user.id,
      action: "CUSTOMER_CREATED",
      entityType: "customer",
      entityId: row.id,
      newValue: { ...row, contacts: people },
    });
    return c.json({ ...row, contacts: people }, 201);
  });

  r.patch("/customers/:id", ...tenantGate, requirePermission("customer.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const before = await getCustomer(db, orgId(c), id);
    if (!before) return c.json({ error: "not_found" }, 404);
    const parsed = await parseJson(c, customerPatchSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    const beforeContacts = parsed.present("contacts") ? await listContacts(db, orgId(c), id) : undefined;
    let row;
    try {
      row = await updateCustomer(db, orgId(c), id, parsed.data, parsed.present);
    } catch (e) {
      return inputError(c, e);
    }
    if (!row) return c.json({ error: "not_found" }, 404);
    const people = await listContacts(db, orgId(c), id);
    await writeAudit(db, {
      userId: user.id,
      action: "CUSTOMER_UPDATED",
      entityType: "customer",
      entityId: id,
      oldValue: beforeContacts ? { ...before, contacts: beforeContacts } : before,
      newValue: beforeContacts ? { ...row, contacts: people } : row,
    });
    return c.json({ ...row, contacts: people });
  });

  r.get("/contacts", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const customerId = c.req.query("customerId");
    const items = await listContacts(db, orgId(c), customerId);
    return c.json({ items });
  });

  r.post("/contacts", ...tenantGate, requirePermission("customer.edit", "customer.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const parsed = await parseJson(c, contactCreateSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    const body = parsed.data;
    if (!(await getCustomer(db, orgId(c), body.customerId))) return c.json({ error: "customer_not_found" }, 404);
    const row = await createContact(db, {
      customerId: body.customerId,
      name: body.name,
      title: body.title ?? "",
      email: body.email ?? "",
      phone: body.phone ?? "",
      wechat: body.wechat ?? "",
      lineId: body.lineId ?? "",
      primary: body.primary ?? false,
    });
    await writeAudit(db, {
      userId: user.id,
      action: "CONTACT_CREATED",
      entityType: "contact",
      entityId: row.id,
      newValue: row,
    });
    return c.json(row, 201);
  });

  r.patch("/contacts/:id", ...tenantGate, requirePermission("customer.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const parsed = await parseJson(c, contactPatchSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) if (parsed.present(k)) patch[k] = v ?? "";
    const row = await updateContact(db, orgId(c), id, patch);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, { userId: user.id, action: "CONTACT_UPDATED", entityType: "contact", entityId: id, newValue: row });
    return c.json(row);
  });

  r.delete("/contacts/:id", ...tenantGate, requirePermission("customer.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const row = await deleteContact(db, orgId(c), id);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, { userId: user.id, action: "CONTACT_DELETED", entityType: "contact", entityId: id, oldValue: row });
    return c.json({ ok: true });
  });

  r.get("/leads", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const stage = c.req.query("stage");
    const items = await listLeads(db, orgId(c), stage);
    return c.json({ items });
  });

  r.post("/leads", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    let body: z.infer<typeof leadCreateSchema>;
    try {
      body = leadCreateSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const row = await createLead(db, orgId(c), body);
    await writeAudit(db, {
      userId: user.id,
      action: "LEAD_CREATED",
      entityType: "lead",
      entityId: row.id,
      newValue: row,
    });
    return c.json(row, 201);
  });

  r.patch("/leads/:id", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    let stage: string;
    try {
      stage = z.object({ stage: z.string().min(1) }).parse(await c.req.json()).stage;
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const row = await updateLeadStage(db, id, stage);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, {
      userId: user.id,
      action: "LEAD_UPDATED",
      entityType: "lead",
      entityId: id,
      newValue: row,
    });
    return c.json(row);
  });

  r.get("/opportunities", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const customerId = c.req.query("customerId");
    const items = await listOpportunities(db, customerId);
    return c.json({ items });
  });

  r.post("/opportunities", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    let body: z.infer<typeof opportunityCreateSchema>;
    try {
      body = opportunityCreateSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const row = await createOpportunity(db, body);
    await writeAudit(db, {
      userId: user.id,
      action: "OPPORTUNITY_CREATED",
      entityType: "opportunity",
      entityId: row.id,
      newValue: row,
    });
    return c.json(row, 201);
  });

  r.patch("/opportunities/:id", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    let stage: string;
    try {
      stage = z.object({ stage: z.string().min(1) }).parse(await c.req.json()).stage;
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const row = await updateOpportunityStage(db, id, stage);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, {
      userId: user.id,
      action: "OPPORTUNITY_UPDATED",
      entityType: "opportunity",
      entityId: id,
      newValue: row,
    });
    return c.json(row);
  });

  return r;
}
