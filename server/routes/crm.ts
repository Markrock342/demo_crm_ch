import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import {
  createContact,
  createCustomer,
  createLead,
  createOpportunity,
  getCustomer,
  listContacts,
  listCustomers,
  listLeads,
  listOpportunities,
  updateCustomer,
  updateLeadStage,
  updateOpportunityStage,
} from "../services/crm.service.js";

const customerCreateSchema = z.object({
  nameZh: z.string().min(1),
  nameTh: z.string().optional(),
  nameEn: z.string().optional(),
  cityZh: z.string().min(1),
  cityTh: z.string().optional(),
  cityEn: z.string().optional(),
  laneZh: z.string().min(1),
  laneTh: z.string().optional(),
  laneEn: z.string().optional(),
  owner: z.string().min(1),
});

const contactCreateSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  wechat: z.string().optional(),
  primary: z.boolean().optional(),
});

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

export function crmRoutes() {
  const r = new Hono<AuthEnv>();

  r.use("*", authMiddleware);

  r.get("/customers", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const q = c.req.query("q");
    const limit = Number(c.req.query("limit") ?? 100);
    const offset = Number(c.req.query("offset") ?? 0);
    const result = await listCustomers(db, { q, limit, offset });
    return c.json(result);
  });

  r.get("/customers/:id", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const row = await getCustomer(db, c.req.param("id"));
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  r.post("/customers", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    let body: z.infer<typeof customerCreateSchema>;
    try {
      body = customerCreateSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const row = await createCustomer(db, body);
    await writeAudit(db, {
      userId: user.id,
      action: "CUSTOMER_CREATED",
      entityType: "customer",
      entityId: row.id,
      newValue: row,
    });
    return c.json(row, 201);
  });

  r.patch("/customers/:id", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const before = await getCustomer(db, id);
    if (!before) return c.json({ error: "not_found" }, 404);
    const patch = await c.req.json();
    const row = await updateCustomer(db, id, patch);
    await writeAudit(db, {
      userId: user.id,
      action: "CUSTOMER_UPDATED",
      entityType: "customer",
      entityId: id,
      oldValue: before,
      newValue: row,
    });
    return c.json(row);
  });

  r.get("/contacts", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const customerId = c.req.query("customerId");
    const items = await listContacts(db, customerId);
    return c.json({ items });
  });

  r.post("/contacts", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    let body: z.infer<typeof contactCreateSchema>;
    try {
      body = contactCreateSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const row = await createContact(db, {
      customerId: body.customerId,
      name: body.name,
      title: body.title ?? "",
      email: body.email ?? "",
      phone: body.phone ?? "",
      wechat: body.wechat ?? "",
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

  r.get("/leads", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const stage = c.req.query("stage");
    const items = await listLeads(db, stage);
    return c.json({ items });
  });

  r.post("/leads", requireAuth(), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    let body: z.infer<typeof leadCreateSchema>;
    try {
      body = leadCreateSchema.parse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    const row = await createLead(db, body);
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
