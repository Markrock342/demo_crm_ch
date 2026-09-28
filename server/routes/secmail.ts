import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { auditFacets, queryAuditLogs } from "../services/audit-query.service.js";
import {
  documentEmailDraft,
  emailPortalCode,
  normalizeRecipients,
  publicBaseUrl,
  sendDocumentEmail,
  type DocKind,
} from "../services/outbound-mail.service.js";

/** E-mail actions (invoice / billing note PDF, portal access code) and the audit-log viewer API. */

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

const tenantGate = [requireAuth(), requireTenant()] as const;

type Issue = { path: string; message: string };
const bad = (c: { json: (b: unknown, s?: number) => Response }, issues: Issue[]) => c.json({ error: "invalid_body", issues }, 400);

const sendSchema = z.object({
  to: z.array(z.string().max(254)).max(20),
  cc: z.array(z.string().max(254)).max(20).optional(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10_000),
});

async function readSend(c: { req: { json: () => Promise<unknown> }; json: (b: unknown, s?: number) => Response }) {
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return { error: bad(c, parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))) };
  const to = normalizeRecipients(parsed.data.to);
  const cc = normalizeRecipients(parsed.data.cc ?? []);
  const issues: Issue[] = [];
  if (to.bad.length) issues.push({ path: "to", message: `invalid e-mail: ${to.bad.join(", ")}` });
  if (!to.ok.length && !to.bad.length) issues.push({ path: "to", message: "recipient required" });
  if (cc.bad.length) issues.push({ path: "cc", message: `invalid e-mail: ${cc.bad.join(", ")}` });
  if (issues.length) return { error: bad(c, issues) };
  return { data: { to: to.ok, cc: cc.ok, subject: parsed.data.subject, body: parsed.data.body } };
}

function parseDate(v: string | undefined, endOfDay = false) {
  if (!v) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+07:00` : v);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setTime(d.getTime() + 24 * 3600 * 1000);
  return d;
}

export function secmailRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  // ---- Invoice / billing note: compose defaults + send with PDF attached
  const docRoutes: { path: string; kind: DocKind; view: "invoice.view" | "billing.view"; send: "invoice.issue" | "billing.create" }[] = [
    { path: "/invoices/:id/email", kind: "invoice", view: "invoice.view", send: "invoice.issue" },
    { path: "/billing-notes/:id/email", kind: "billing_note", view: "billing.view", send: "billing.create" },
  ];
  for (const d of docRoutes) {
    r.get(d.path, ...tenantGate, requirePermission(d.view), async (c) => {
      const db = dbOr503(c);
      if (typeof db !== "object" || !("select" in db)) return db;
      const draft = await documentEmailDraft(db, c.get("organizationId")!, d.kind, c.req.param("id")!);
      if (!draft) return c.json({ error: "not_found" }, 404);
      return c.json(draft);
    });

    r.post(d.path, ...tenantGate, requirePermission(d.send), async (c) => {
      const db = dbOr503(c);
      if (typeof db !== "object" || !("select" in db)) return db;
      const input = await readSend(c);
      if (input.error) return input.error;
      const sent = await sendDocumentEmail(db, c.get("organizationId")!, c.get("user")!.id, d.kind, c.req.param("id")!, input.data);
      if (!sent) return c.json({ error: "not_found" }, 404);
      if (sent.status === "failed") return c.json({ error: "send_failed", detail: sent.error, outbound: sent }, 502);
      return c.json({ outbound: sent });
    });
  }

  // ---- Portal access code: e-mail the just-issued code to the customer's contacts
  r.post("/customers/:id/portal-code/email", ...tenantGate, requirePermission("customer.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const parsed = z.object({ code: z.string().trim().min(6).max(40) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad(c, [{ path: "code", message: "access code required" }]);
    const origin = new URL(c.req.url).origin;
    const res = await emailPortalCode(
      db,
      c.get("organizationId")!,
      c.get("user")!.id,
      c.req.param("id")!,
      parsed.data.code,
      `${publicBaseUrl(origin)}/portal`,
    );
    if ("error" in res) {
      if (res.error === "not_found") return c.json({ error: "not_found" }, 404);
      if (res.error === "code_mismatch") return c.json({ error: "code_mismatch" }, 409);
      return c.json({ error: "no_recipient" }, 422);
    }
    if (!res.sent.length) return c.json({ error: "send_failed", detail: res.failed[0]?.error ?? null, ...res }, 502);
    return c.json(res);
  });

  // ---- Audit log viewer
  r.get("/audit-logs", ...tenantGate, requirePermission("audit.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const from = parseDate(c.req.query("from"));
    const to = parseDate(c.req.query("to"), true);
    const issues: Issue[] = [];
    if (from === null) issues.push({ path: "from", message: "invalid date" });
    if (to === null) issues.push({ path: "to", message: "invalid date" });
    const userId = c.req.query("userId") || undefined;
    if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) issues.push({ path: "userId", message: "invalid id" });
    if (issues.length) return bad(c, issues);
    return c.json(
      await queryAuditLogs(db, c.get("organizationId")!, {
        userId,
        entityType: c.req.query("entityType") || undefined,
        action: c.req.query("action") || undefined,
        from: from ?? undefined,
        to: to ?? undefined,
        q: c.req.query("q")?.slice(0, 100) || undefined,
        page: Number(c.req.query("page")) || 1,
        pageSize: Number(c.req.query("pageSize")) || 25,
      }),
    );
  });

  r.get("/audit-logs/facets", ...tenantGate, requirePermission("audit.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json(await auditFacets(db, c.get("organizationId")!));
  });

  return r;
}
