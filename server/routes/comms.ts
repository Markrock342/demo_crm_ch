import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { eq } from "drizzle-orm";
import { crmDocs, documentTemplates } from "../db/schema/index.js";
import { objectKeyForDoc, readObject, saveObject } from "../lib/storage.js";
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

const tenantGate = [requireAuth(), requireTenant()] as const;

function orgId(c: { get: (k: "organizationId") => string | null }) {
  return c.get("organizationId")!;
}

export function commsRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.get("/mails", ...tenantGate, requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listMails(db, orgId(c), c.req.query("customerId")) });
  });

  r.post("/mails", ...tenantGate, requirePermission("customer.view"), async (c) => {
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
    const row = await createMail(db, body, orgId(c));
    return c.json(row, 201);
  });

  r.patch("/mails/:id", ...tenantGate, requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const id = c.req.param("id");
    const patch = mailPatchSchema.parse(await c.req.json());
    const existing = await getMail(db, orgId(c), id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (patch.state && !mailTransitionAllowed(existing.state, patch.state)) {
      return c.json({ error: "invalid_status" }, 409);
    }
    const row = await updateMail(db, orgId(c), id, {
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

  r.get("/docs", ...tenantGate, requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listCrmDocs(db, orgId(c), c.req.query("customerId")) });
  });

  r.patch("/docs/:id", ...tenantGate, requirePermission("customer.view"), async (c) => {
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

  r.post("/docs", ...tenantGate, requirePermission("customer.view"), async (c) => {
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
    return c.json(await upsertCrmDoc(db, body, orgId(c)), 201);
  });

  r.post("/mails/:id/send", ...tenantGate, requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const id = c.req.param("id");
    const existing = await getMail(db, orgId(c), id);
    if (!existing) return c.json({ error: "not_found" }, 404);
    if (existing.state !== "open") return c.json({ error: "invalid_status" }, 409);
    const body = z
      .object({
        to: z.string().optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        jobId: z.string().optional(),
        confirm: z.literal(true),
      })
      .parse(await c.req.json());
    const { createMailTransport } = await import("../mail/transport.js");
    const transport = createMailTransport();
    const draftBody = body.body || existing.draftEn || existing.draftZh || existing.bodyEn;
    const result = await transport.send({
      to: body.to || existing.from || "sandbox@local",
      subject: body.subject || existing.subjectEn || existing.subjectZh,
      body: draftBody,
      mailId: id,
      customerId: existing.customerId,
      jobId: body.jobId,
    });
    if (!mailTransitionAllowed(existing.state, "sent")) {
      return c.json({ error: "invalid_status" }, 409);
    }
    const row = await updateMail(db, orgId(c), id, { state: "sent", unread: false });
    return c.json({ mail: row, sandbox: result });
  });

  r.get("/mails/sandbox/outbox", requireAuth(), requirePermission("customer.view"), async (c) => {
    const { getSandboxOutbox } = await import("../mail/transport.js");
    return c.json({ items: getSandboxOutbox() });
  });

  /** Inbound paste/webhook — no session required; optional WEBHOOK_SECRET. */
  r.post("/webhooks/inbound-mail", async (c) => {
    const secret = process.env.WEBHOOK_SECRET?.trim();
    if (secret) {
      const hdr = c.req.header("x-webhook-secret") || "";
      if (hdr !== secret) return c.json({ error: "forbidden" }, 403);
    }
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = z
      .object({
        from: z.string().default("webhook"),
        subject: z.string().default(""),
        body: z.string().min(1),
        customerId: z.string().optional(),
        jobId: z.string().optional(),
      })
      .parse(await c.req.json());
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const subj = body.subject || body.body.slice(0, 60);
    const row = await createMail(db, {
      customerId: body.customerId ?? "",
      from: body.from,
      subjectZh: subj,
      subjectTh: subj,
      subjectEn: subj,
      bodyZh: body.body,
      bodyTh: body.body,
      bodyEn: body.body,
      draftZh: "",
      draftTh: "",
      draftEn: "",
      time,
      confidence: 0,
      unread: true,
      state: "open",
      summary: body.jobId ? `jobId=${body.jobId}` : undefined,
    });
    return c.json(row, 201);
  });

  r.post("/docs/:id/upload", requireAuth(), requireTenant(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const orgId = c.get("organizationId")!;
    const docId = c.req.param("id");
    const [doc] = await db.select().from(crmDocs).where(eq(crmDocs.id, docId)).limit(1);
    if (!doc || doc.organizationId !== orgId) return c.json({ error: "not_found" }, 404);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file_required" }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const key = objectKeyForDoc(docId, file.name);
    await saveObject(orgId, key, bytes);

    const [row] = await db
      .update(crmDocs)
      .set({
        storageKey: key,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: String(bytes.length),
        updatedAt: new Date(),
      })
      .where(eq(crmDocs.id, docId))
      .returning();
    return c.json(row);
  });

  r.get("/docs/:id/file", requireAuth(), requireTenant(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const orgId = c.get("organizationId")!;
    const docId = c.req.param("id");
    const [doc] = await db.select().from(crmDocs).where(eq(crmDocs.id, docId)).limit(1);
    if (!doc?.storageKey || doc.organizationId !== orgId) return c.json({ error: "not_found" }, 404);
    const bytes = await readObject(orgId, doc.storageKey);
    if (!bytes) return c.json({ error: "not_found" }, 404);
    return new Response(bytes, {
      headers: {
        "Content-Type": doc.mimeType ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc.name}"`,
      },
    });
  });

  r.get("/document-templates", requireAuth(), requireTenant(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const orgId = c.get("organizationId")!;
    const rows = await db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, orgId));
    return c.json({ items: rows });
  });

  r.get("/document-templates/:id/preview", requireAuth(), requireTenant(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const orgId = c.get("organizationId")!;
    const [tpl] = await db.select().from(documentTemplates).where(eq(documentTemplates.id, c.req.param("id"))).limit(1);
    if (!tpl || tpl.organizationId !== orgId) return c.json({ error: "not_found" }, 404);
    try {
      const { generate } = await import("@pdfme/generator");
      const { text } = await import("@pdfme/schemas");
      const template = tpl.templateJson as Parameters<typeof generate>[0]["template"];
      const pdf = await generate({
        template,
        inputs: [{ title: tpl.name }],
        plugins: { text },
      });
      return new Response(pdf, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${tpl.code}-preview.pdf"` },
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "preview_failed" }, 400);
    }
  });

  r.patch("/document-templates/:id", requireAuth(), requireTenant(), requirePermission("customer.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const orgId = c.get("organizationId")!;
    const body = z.object({ templateJson: z.record(z.string(), z.unknown()).optional(), name: z.string().optional() }).parse(await c.req.json());
    const [row] = await db
      .update(documentTemplates)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(documentTemplates.id, c.req.param("id")))
      .returning();
    if (!row || row.organizationId !== orgId) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  return r;
}
