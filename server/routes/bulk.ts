import { Hono } from "hono";
import { z } from "zod";
import { getDb, hasDatabase } from "../db/index.js";
import { hasPermission, type RoleCode } from "../domain/rbac.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import { BULK_MAX, BulkError, JOB_BULK_STATUSES, bulkAssignJobOwner, bulkIssueInvoices, bulkSetJobStatus, toCsv } from "../services/bulk.service.js";
import { JOB_STAGE_KEYS, listJobsPage, parseJobListQuery } from "../services/job-list.service.js";
import { listInvoicesPage, parseInvoiceListQuery } from "../services/invoice-list.service.js";

/**
 * Bulk actions + CSV exports for the jobs and invoices lists.
 *   POST /api/bulk/jobs              { ids, action: "status", status } | { ids, action: "owner", field: "sales"|"ops", userId|null }
 *   POST /api/bulk/invoices/issue    { ids }  — issues the drafts, reports the rest as skipped
 *   GET  /api/exports/jobs.csv       same filters as GET /api/jobs (or ids=a,b,c)
 *   GET  /api/exports/invoices.csv   same filters as GET /api/invoices (or ids=a,b,c)
 * Billing notes for a selection reuse POST /api/billing-notes.
 */

const gate = [requireAuth(), requireTenant()] as const;
const EXPORT_MAX = 20_000;

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  return getDb() ?? c.json({ error: "database_unavailable" }, 503);
}

const ids = z.array(z.string().min(1)).min(1, "ids_required").max(BULK_MAX, "too_many");
const jobsBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), ids, status: z.enum(JOB_BULK_STATUSES) }),
  z.object({ action: z.literal("owner"), ids, field: z.enum(["sales", "ops"]), userId: z.string().uuid().nullable() }),
]);

function fieldErrors(e: z.ZodError) {
  return e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

const HEAD: Record<string, Record<"th" | "zh" | "en", string>> = {
  jobNumber: { th: "เลข Job", zh: "工作单号", en: "Job no." },
  customer: { th: "ลูกค้า", zh: "客户", en: "Customer" },
  status: { th: "สถานะ", zh: "状态", en: "Status" },
  stage: { th: "ขั้นตอน", zh: "阶段", en: "Stage" },
  pol: { th: "ท่าต้นทาง", zh: "起运港", en: "POL" },
  pod: { th: "ท่าปลายทาง", zh: "目的港", en: "POD" },
  carrier: { th: "สายเรือ", zh: "船公司", en: "Carrier" },
  vessel: { th: "เรือ / เที่ยว", zh: "船名 / 航次", en: "Vessel / voyage" },
  etd: { th: "ETD", zh: "ETD", en: "ETD" },
  eta: { th: "ETA", zh: "ETA", en: "ETA" },
  containers: { th: "ตู้", zh: "柜量", en: "Containers" },
  teu: { th: "TEU", zh: "TEU", en: "TEU" },
  next: { th: "ขั้นต่อไป", zh: "下一步", en: "Next step" },
  late: { th: "ล่าช้า", zh: "延误", en: "Delayed" },
  billing: { th: "สถานะวางบิล", zh: "开票状态", en: "Billing" },
  gp: { th: "กำไรขั้นต้น", zh: "毛利", en: "Gross profit" },
  currency: { th: "สกุลเงิน", zh: "币种", en: "Currency" },
  invoiceNumber: { th: "เลขใบแจ้งหนี้", zh: "发票号", en: "Invoice no." },
  job: { th: "Job", zh: "工作单", en: "Job" },
  issueDate: { th: "วันที่ออก", zh: "开票日", en: "Issue date" },
  dueDate: { th: "ครบกำหนด", zh: "到期日", en: "Due date" },
  total: { th: "ยอดรวม", zh: "合计", en: "Total" },
  paid: { th: "รับแล้ว", zh: "已收", en: "Paid" },
  balance: { th: "คงค้าง", zh: "未收", en: "Balance" },
};

function lang(v: string | undefined): "th" | "zh" | "en" {
  return v === "zh" || v === "en" ? v : "th";
}

function customerName(l: "th" | "zh" | "en", r: { customerNameTh?: string | null; customerNameZh?: string | null; customerNameEn?: string | null }) {
  const order = l === "th" ? [r.customerNameTh, r.customerNameEn, r.customerNameZh] : l === "zh" ? [r.customerNameZh, r.customerNameEn, r.customerNameTh] : [r.customerNameEn, r.customerNameTh, r.customerNameZh];
  return order.find((v) => v && v.trim()) ?? "";
}

function csvResponse(body: string, name: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

const today = () => new Date().toISOString().slice(0, 10);

export function bulkRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.post("/bulk/jobs", ...gate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const parsed = jobsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: fieldErrors(parsed.error) }, 400);
    const user = c.get("user")!;
    const org = c.get("organizationId")!;
    const body = parsed.data;
    try {
      const result =
        body.action === "status"
          ? await bulkSetJobStatus(db, org, body.ids, body.status)
          : await bulkAssignJobOwner(db, org, body.ids, body.field, body.userId);
      await writeAudit(db, {
        userId: user.id,
        organizationId: org,
        action: body.action === "status" ? "JOB_BULK_STATUS" : "JOB_BULK_OWNER",
        entityType: "job",
        entityId: body.ids.length === 1 ? body.ids[0] : null,
        oldValue: result.before,
        newValue: { ...body, updated: result.updated },
      });
      return c.json({ updated: result.updated, unchanged: result.unchanged });
    } catch (e) {
      if (e instanceof BulkError) return c.json({ error: e.message, issues: [{ path: e.field ?? "", message: e.message }] }, e.status);
      throw e;
    }
  });

  r.post("/bulk/invoices/issue", ...gate, requirePermission("invoice.issue"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const parsed = z.object({ ids }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: fieldErrors(parsed.error) }, 400);
    const user = c.get("user")!;
    const org = c.get("organizationId")!;
    try {
      const result = await bulkIssueInvoices(db, org, parsed.data.ids, user.id);
      for (const inv of result.issued) {
        await writeAudit(db, { userId: user.id, organizationId: org, action: "INVOICE_ISSUED", entityType: "invoice", entityId: inv.id, newValue: { status: "ISSUED", bulk: true } });
      }
      return c.json(result);
    } catch (e) {
      if (e instanceof BulkError) return c.json({ error: e.message, issues: [{ path: e.field ?? "", message: e.message }] }, e.status);
      throw e;
    }
  });

  r.get("/exports/jobs.csv", ...gate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const user = c.get("user")!;
    const l = lang(c.req.query("lang"));
    const q = parseJobListQuery((k) => c.req.query(k));
    const idList = c.req.query("ids")?.split(",").filter(Boolean).slice(0, BULK_MAX);
    const page = await listJobsPage(db, c.get("organizationId")!, { ...q, ids: idList, perStage: undefined, limit: EXPORT_MAX, offset: 0 });
    const roles = user.roles as RoleCode[];
    const showGp = hasPermission(roles, "finance.revenue.view") && hasPermission(roles, "finance.cost.view");
    const cols = ["jobNumber", "customer", "status", "stage", "pol", "pod", "carrier", "vessel", "etd", "eta", "containers", "teu", "next", "late", "billing", ...(showGp ? ["gp", "currency"] : [])];
    const rows = page.items.map((j) => {
      const v: Record<string, string | number | null> = {
        jobNumber: j.jobNumber,
        customer: customerName(l, j),
        status: j.status,
        stage: JOB_STAGE_KEYS[j.stage] ?? "",
        pol: j.pol,
        pod: j.pod,
        carrier: j.carrier,
        vessel: [j.vessel, j.voyage].filter(Boolean).join(" / "),
        etd: j.etd,
        eta: j.eta,
        containers: j.containerCount,
        teu: j.teu,
        next: j.nextMilestoneLabel ?? "",
        late: j.milestoneAtRisk ? "Y" : "",
        billing: j.billingStatus,
        gp: j.grossProfit,
        currency: j.currency,
      };
      return cols.map((k) => v[k] ?? null);
    });
    return csvResponse(toCsv(cols.map((k) => HEAD[k]![l]), rows), `jobs-${today()}.csv`);
  });

  r.get("/exports/invoices.csv", ...gate, requirePermission("invoice.view"), async (c) => {
    const db = dbOr503(c);
    if (db instanceof Response) return db;
    const l = lang(c.req.query("lang"));
    const q = parseInvoiceListQuery((k) => c.req.query(k));
    const idList = c.req.query("ids")?.split(",").filter(Boolean).slice(0, BULK_MAX);
    const page = await listInvoicesPage(db, c.get("organizationId")!, { ...q, ids: idList, perGroup: undefined, limit: EXPORT_MAX, offset: 0 });
    const cols = ["invoiceNumber", "customer", "job", "status", "issueDate", "dueDate", "currency", "total", "paid", "balance"];
    const d = (v: string) => (v ? String(v).slice(0, 10) : "");
    const rows = page.items.map((i) => [
      i.invoiceNumber,
      customerName(l, i),
      i.jobNumber,
      i.group === "overdue" ? "OVERDUE" : i.status,
      d(i.issueDate),
      d(i.dueDate),
      i.currency,
      i.total,
      i.paidAmount,
      i.balanceDue,
    ]);
    return csvResponse(toCsv(cols.map((k) => HEAD[k]![l]), rows), `invoices-${today()}.csv`);
  });

  return r;
}
