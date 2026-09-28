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
  getCustomer,
  listContacts,
  listCustomers,
  updateContact,
  updateCustomer,
} from "../services/crm.service.js";
import { listCustomersPage, parseCustomerListQuery, wantsPagedCustomers } from "../services/customer-list.service.js";
import {
  createDealRow,
  createLeadRow,
  DEAL_STAGES,
  LEAD_STAGES,
  listDealRows,
  listLeadRows,
  PipelineInputError,
  totalsByCurrency,
  updateDealRow,
  updateLeadRow,
} from "../services/pipeline.service.js";

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

const ownerUserId = z.string().uuid("invalid_user").nullable().optional();
const shortText = (max = 200) => z.string().trim().max(max);

const leadCreateSchema = z.object({
  company: z.string().trim().min(1, "required").max(200),
  city: shortText().optional(),
  lane: shortText().optional(),
  contact: shortText().optional(),
  source: shortText().optional(),
  teu: z.number().int().nonnegative().max(100000).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  ownerUserId,
  owner: shortText(80).optional(),
});
const leadPatchSchema = leadCreateSchema.omit({ owner: true }).partial();

const opportunityCreateSchema = z.object({
  customerId: z.string().min(1),
  title: z.string().trim().min(1, "required").max(200),
  lane: shortText().optional(),
  value: z.number().int().nonnegative().max(1_000_000_000_000).optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter code").optional(),
  teu: z.number().int().nonnegative().max(100000).optional(),
  close: shortText(20).optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  ownerUserId,
  owner: shortText(80).optional(),
});
const opportunityPatchSchema = opportunityCreateSchema.omit({ customerId: true, owner: true }).partial();

function pipelineError(c: { json: (b: unknown, s?: number) => Response }, e: unknown) {
  if (e instanceof PipelineInputError) {
    if (e.status === 404) return c.json({ error: e.code }, 404);
    return c.json({ error: "invalid_body", issues: [{ path: e.field ?? "", message: e.code }] }, 400);
  }
  throw e;
}

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
    const get = (k: string) => c.req.query(k);
    // Customers screen (tab / owner / stats): counts + money per row, all in SQL.
    if (wantsPagedCustomers(get)) return c.json(await listCustomersPage(db, orgId(c), parseCustomerListQuery(get)));
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
      organizationId: orgId(c),
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
      organizationId: orgId(c),
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
      organizationId: orgId(c),
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
    await writeAudit(db, { organizationId: orgId(c), userId: user.id, action: "CONTACT_UPDATED", entityType: "contact", entityId: id, newValue: row });
    return c.json(row);
  });

  r.delete("/contacts/:id", ...tenantGate, requirePermission("customer.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const row = await deleteContact(db, orgId(c), id);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, { organizationId: orgId(c), userId: user.id, action: "CONTACT_DELETED", entityType: "contact", entityId: id, oldValue: row });
    return c.json({ ok: true });
  });

  /* ── Leads & deals (owner = staff user, deal currency) ─────────── */

  r.get("/leads", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const items = await listLeadRows(db, orgId(c), c.req.query("stage") || undefined);
    return c.json({ items });
  });

  r.post("/leads", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const parsed = await parseJson(c, leadCreateSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    try {
      const row = await createLeadRow(db, orgId(c), parsed.data);
      await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "LEAD_CREATED", entityType: "lead", entityId: row.id, newValue: row });
      return c.json(row, 201);
    } catch (e) {
      return pipelineError(c, e);
    }
  });

  r.patch("/leads/:id", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const parsed = await parseJson(c, leadPatchSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    try {
      const res = await updateLeadRow(db, orgId(c), c.req.param("id"), parsed.data);
      if (!res) return c.json({ error: "not_found" }, 404);
      await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "LEAD_UPDATED", entityType: "lead", entityId: res.after.id, oldValue: res.before, newValue: res.after });
      return c.json(res.after);
    } catch (e) {
      return pipelineError(c, e);
    }
  });

  r.get("/opportunities", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const items = await listDealRows(db, orgId(c), c.req.query("customerId") || undefined);
    return c.json({ items, totals: totalsByCurrency(items), openTotals: totalsByCurrency(items, true) });
  });

  r.post("/opportunities", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const parsed = await parseJson(c, opportunityCreateSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    try {
      const row = await createDealRow(db, orgId(c), parsed.data);
      await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "OPPORTUNITY_CREATED", entityType: "opportunity", entityId: row.id, newValue: row });
      return c.json(row, 201);
    } catch (e) {
      return pipelineError(c, e);
    }
  });

  r.patch("/opportunities/:id", ...tenantGate, async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const parsed = await parseJson(c, opportunityPatchSchema);
    if (!parsed.data) return c.json({ error: "invalid_body", issues: parsed.issues }, 400);
    try {
      const res = await updateDealRow(db, orgId(c), c.req.param("id"), parsed.data);
      if (!res) return c.json({ error: "not_found" }, 404);
      await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "OPPORTUNITY_UPDATED", entityType: "opportunity", entityId: res.after.id, oldValue: res.before, newValue: res.after });
      return c.json(res.after);
    } catch (e) {
      return pipelineError(c, e);
    }
  });

  return r;
}
