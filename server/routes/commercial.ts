import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import { createInvoiceFromJob, createBillingNote, createVendorBillFromJob, approveVendorBill, getArSummary, getInvoice, getVendorBill, issueInvoice, listBillingNotes, listInvoices, listPayments, listVendorBills, payVendorBill, recordPayment } from "../services/finance.service.js";
import { createContainer, getContainer, listContainers, updateContainer } from "../services/container.service.js";
import { createJobTask, listJobTasks, updateJobTask } from "../services/job-tasks.service.js";
import { ensureJobMilestones, listMilestonesForJobs, setMilestoneComplete, summarizeMilestones } from "../services/milestone.service.js";
import { getJob, listBookingsByQuotation, listJobCharges, listJobs, updateChargeActual } from "../services/operations.service.js";
import { enrichJobsForList } from "../services/job-enrichment.service.js";
import { generateBillingNotePdf, generateQuotationPdf } from "../services/pdf.service.js";
import {
  createBookingFromQuotation,
  createJobFromBooking,
  createQuotationFromRate,
  decideApproval,
  getJobFinancials,
  getPublicQuotation,
  getQuotationDetail,
  listQuotations,
  sendQuotation,
  signQuotation,
  submitForApproval,
} from "../services/quotation.service.js";
import { createRateSheetWithLane, getRateLaneCharges, listVendors, searchRates } from "../services/rate.service.js";
import type { RoleCode } from "../domain/rbac.js";

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

function roles(c: { get: (k: "user") => { roles: RoleCode[] } | null }) {
  return (c.get("user")?.roles ?? []) as RoleCode[];
}

function orgId(c: { get: (k: "organizationId") => string | null }) {
  return c.get("organizationId")!;
}

const tenantGate = [requireAuth(), requireTenant()] as const;

export function commercialRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.get("/vendors", requireAuth(), requirePermission("rate.view_sell", "vendor_bill.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listVendors(db) });
  });

  r.get("/rates/search", requireAuth(), requirePermission("rate.view_sell"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const items = await searchRates(db, {
      origin: c.req.query("origin"),
      destination: c.req.query("destination"),
      pol: c.req.query("pol"),
      pod: c.req.query("pod"),
      mode: c.req.query("mode"),
      containerType: c.req.query("containerType"),
      roles: roles(c),
    });
    return c.json({ items });
  });

  r.get("/rates/lanes/:id", requireAuth(), requirePermission("rate.view_sell"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const row = await getRateLaneCharges(db, c.req.param("id"), roles(c));
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  r.post("/rates", requireAuth(), requirePermission("rate.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({
        vendorId: z.string(),
        name: z.string(),
        carrier: z.string().optional(),
        validFrom: z.string(),
        validUntil: z.string(),
        currency: z.string(),
        lane: z.object({
          origin: z.string(),
          destination: z.string(),
          pol: z.string(),
          pod: z.string(),
          mode: z.string(),
          containerType: z.string().optional(),
        }),
        charges: z.array(
          z.object({
            chargeCode: z.string(),
            description: z.string(),
            side: z.enum(["BUY", "SELL"]),
            unit: z.string(),
            quantity: z.string(),
            unitPrice: z.string(),
            currency: z.string(),
          }),
        ),
      })
      .parse(await c.req.json());

    const result = await createRateSheetWithLane(db, {
      ...body,
      validFrom: new Date(body.validFrom),
      validUntil: new Date(body.validUntil),
    });
    await writeAudit(db, { userId: user.id, action: "RATE_CREATED", entityType: "rate_lane", entityId: result.laneId, newValue: result });
    return c.json(result, 201);
  });

  r.get("/quotations", ...tenantGate, requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const customerId = c.req.query("customerId");
    return c.json({ items: await listQuotations(db, orgId(c), customerId) });
  });

  r.get("/quotations/:id/pdf", ...tenantGate, requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    try {
      const bytes = await generateQuotationPdf(db, orgId(c), c.req.param("id"));
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="quotation-${c.req.param("id")}.pdf"`,
        },
      });
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });

  r.get("/quotations/:id/bookings", ...tenantGate, requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listBookingsByQuotation(db, orgId(c), c.req.param("id")) });
  });

  r.get("/jobs", ...tenantGate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const customerId = c.req.query("customerId");
    const milestoneFilter = c.req.query("milestoneFilter") as "all" | "at_risk" | "pending" | undefined;
    const filter = milestoneFilter === "at_risk" || milestoneFilter === "pending" ? milestoneFilter : "all";
    const limit = Math.min(Number(c.req.query("limit") || 200), 500);
    const offset = Math.max(Number(c.req.query("offset") || 0), 0);
    const rows = await listJobs(db, orgId(c), customerId, filter);
    const page = rows.slice(offset, offset + limit);
    const enrichment = await enrichJobsForList(
      db,
      page.map((j) => j.id),
    );
    const milestoneMap = await listMilestonesForJobs(
      db,
      page.map((j) => j.id),
    );
    const items = page.map((j) => {
      const ms = milestoneMap.get(j.id) ?? [];
      const summary = summarizeMilestones(ms);
      const extra = enrichment.get(j.id);
      return {
        id: j.id,
        jobNumber: j.jobNumber,
        customerId: j.customerId,
        origin: j.origin,
        destination: j.destination,
        pol: j.pol,
        pod: j.pod,
        mode: j.mode,
        status: j.status,
        teu: j.teu,
        currency: j.currency,
        carrier: j.carrier,
        vessel: j.vessel,
        voyage: j.voyage,
        etd: j.etd,
        eta: j.eta,
        containerType: j.containerType,
        containerCount: j.containerCount,
        incoterm: j.incoterm,
        assignedOperator: j.assignedOperator,
        salesOwnerId: j.salesOwnerId,
        nextMilestoneCode: summary.nextCode,
        nextMilestoneLabel: summary.nextLabel,
        nextMilestonePlannedAt: summary.nextPlannedAt,
        milestoneAtRisk: summary.atRisk,
        milestonePendingCount: summary.pendingCount,
        grossProfit: extra?.grossProfit ?? null,
        billingStatus: extra?.billingStatus ?? "UNBILLED",
      };
    });
    return c.json({ items, total: rows.length, limit, offset });
  });

  r.get("/jobs/:id", ...tenantGate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const job = await getJob(db, orgId(c), c.req.param("id"));
    if (!job) return c.json({ error: "not_found" }, 404);
    return c.json(job);
  });

  r.get("/jobs/:id/charges", ...tenantGate, requirePermission("finance.revenue.view", "finance.cost.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listJobCharges(db, orgId(c), c.req.param("id")) });
  });

  r.patch("/jobs/:id/charges/:chargeId", ...tenantGate, requirePermission("finance.cost.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const { actualAmount } = z.object({ actualAmount: z.string() }).parse(await c.req.json());
    const row = await updateChargeActual(db, orgId(c), c.req.param("id"), c.req.param("chargeId"), actualAmount);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, {
      userId: user.id,
      action: "SHIPMENT_CHARGE_UPDATED",
      entityType: "shipment_charge",
      entityId: row.id,
      newValue: row,
    });
    return c.json(row);
  });

  r.get("/invoices/:id", ...tenantGate, requirePermission("invoice.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const row = await getInvoice(db, orgId(c), c.req.param("id"));
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  r.post("/billing-notes", ...tenantGate, requirePermission("billing.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z.object({ customerId: z.string(), invoiceIds: z.array(z.string()).min(1) }).parse(await c.req.json());
    const result = await createBillingNote(db, orgId(c), body);
    await writeAudit(db, {
      userId: user.id,
      action: "BILLING_NOTE_CREATED",
      entityType: "billing_note",
      entityId: result.id,
      newValue: result,
    });
    return c.json(result, 201);
  });

  r.get("/billing-notes", ...tenantGate, requirePermission("billing.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listBillingNotes(db, orgId(c), c.req.query("customerId")) });
  });

  r.get("/billing-notes/:id/pdf", ...tenantGate, requirePermission("billing.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    try {
      const bytes = await generateBillingNotePdf(db, c.req.param("id"));
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="billing-${c.req.param("id")}.pdf"`,
        },
      });
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });

  r.get("/payments", ...tenantGate, requirePermission("payment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listPayments(db, orgId(c), c.req.query("customerId")) });
  });

  r.get("/quotations/:id", ...tenantGate, requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const detail = await getQuotationDetail(db, orgId(c), c.req.param("id"), roles(c));
    if (!detail) return c.json({ error: "not_found" }, 404);
    return c.json(detail);
  });

  r.post("/quotations/from-rate", ...tenantGate, requirePermission("quotation.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({
        customerId: z.string(),
        contactId: z.string().optional(),
        opportunityId: z.string().optional(),
        rateLaneId: z.string(),
        quantity: z.number().int().positive(),
        markupPct: z.string().optional(),
      })
      .parse(await c.req.json());
    try {
      const result = await createQuotationFromRate(db, orgId(c), { ...body, createdBy: user.id, salesOwnerId: user.id });
      await writeAudit(db, { userId: user.id, action: "QUOTE_CREATED", entityType: "quotation", entityId: result.id, newValue: result });
      return c.json(result, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "customer_not_found" || msg === "rate_lane_not_found") return c.json({ error: "not_found" }, 404);
      throw e;
    }
  });

  r.post("/quotations/:id/submit-approval", ...tenantGate, requirePermission("quotation.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    try {
      const result = await submitForApproval(db, orgId(c), id, user.id);
      await writeAudit(db, { userId: user.id, action: "QUOTE_APPROVAL_REQUESTED", entityType: "quotation", entityId: id, newValue: result });
      return c.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      throw e;
    }
  });

  r.post("/quotations/:id/approve", ...tenantGate, requirePermission("quotation.approve"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().optional() }).parse(await c.req.json());
    const id = c.req.param("id");
    try {
      const result = await decideApproval(db, orgId(c), id, user.id, body.decision, body.comment);
      await writeAudit(db, {
        userId: user.id,
        action: body.decision === "APPROVED" ? "QUOTE_APPROVED" : "QUOTE_REJECTED",
        entityType: "quotation",
        entityId: id,
        newValue: result,
      });
      return c.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "not_found" || msg === "approval_not_found") return c.json({ error: "not_found" }, 404);
      throw e;
    }
  });

  r.post("/quotations/:id/send", ...tenantGate, requirePermission("quotation.send"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    try {
      const result = await sendQuotation(db, orgId(c), id, user.id);
      await writeAudit(db, { userId: user.id, action: "QUOTE_SENT", entityType: "quotation", entityId: id, newValue: result });
      return c.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      throw e;
    }
  });

  r.post("/quotations/:id/booking", ...tenantGate, requirePermission("quotation.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    try {
      const result = await createBookingFromQuotation(db, orgId(c), id);
      await writeAudit(db, { userId: user.id, action: "BOOKING_CREATED", entityType: "booking", entityId: result.id, newValue: result });
      return c.json(result, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "quotation_not_accepted" || msg === "not_found") return c.json({ error: msg }, 400);
      throw e;
    }
  });

  r.post("/bookings/:id/job", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    try {
      const result = await createJobFromBooking(db, orgId(c), c.req.param("id"));
      await writeAudit(db, { userId: user.id, action: "SHIPMENT_CREATED", entityType: "job", entityId: result.id, newValue: result });
      return c.json(result, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "booking_not_found" || msg === "customer_not_found") return c.json({ error: "not_found" }, 404);
      throw e;
    }
  });

  r.get("/jobs/:id/financials", ...tenantGate, requirePermission("finance.revenue.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    try {
      return c.json(await getJobFinancials(db, orgId(c), c.req.param("id"), roles(c)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      throw e;
    }
  });

  r.get("/jobs/:id/milestones", ...tenantGate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const jobId = c.req.param("id");
    const job = await getJob(db, orgId(c), jobId);
    if (!job) return c.json({ error: "not_found" }, 404);
    const items = await ensureJobMilestones(db, jobId);
    return c.json({ items });
  });

  r.patch("/jobs/:id/milestones/:code", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const jobId = c.req.param("id");
    const job = await getJob(db, orgId(c), jobId);
    if (!job) return c.json({ error: "not_found" }, 404);
    const { complete } = z.object({ complete: z.boolean() }).parse(await c.req.json());
    const row = await setMilestoneComplete(db, jobId, c.req.param("code"), complete);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, {
      userId: user.id,
      action: complete ? "MILESTONE_COMPLETED" : "MILESTONE_REOPENED",
      entityType: "job_milestone",
      entityId: row.id,
      newValue: row,
    });
    return c.json(row);
  });

  r.get("/jobs/:id/tasks", ...tenantGate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listJobTasks(db, orgId(c), c.req.param("id")) });
  });

  r.post("/jobs/:id/tasks", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({
        title: z.string().min(1),
        owner: z.string().optional(),
        priority: z.enum(["high", "mid", "low"]).optional(),
        dueAt: z.string().nullable().optional(),
      })
      .parse(await c.req.json());
    const row = await createJobTask(db, orgId(c), { jobId: c.req.param("id"), ...body });
    await writeAudit(db, { userId: user.id, action: "JOB_TASK_CREATED", entityType: "job_task", entityId: row.id, newValue: row });
    return c.json(row, 201);
  });

  r.patch("/jobs/:id/tasks/:taskId", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const patch = z
      .object({
        title: z.string().optional(),
        owner: z.string().optional(),
        priority: z.enum(["high", "mid", "low"]).optional(),
        done: z.boolean().optional(),
        dueAt: z.string().nullable().optional(),
      })
      .parse(await c.req.json());
    const row = await updateJobTask(db, orgId(c), c.req.param("id"), c.req.param("taskId"), patch);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, { userId: user.id, action: "JOB_TASK_UPDATED", entityType: "job_task", entityId: row.id, newValue: row });
    return c.json(row);
  });

  r.get("/containers", ...tenantGate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const status = c.req.query("status");
    const customerId = c.req.query("customerId");
    const jobId = c.req.query("jobId");
    const yard = c.req.query("yard");
    const statuses = yard === "1" ? ["yard", "empty", "hold"] : undefined;
    return c.json({
      items: await listContainers(db, orgId(c), {
        status: statuses ? undefined : status,
        customerId,
        jobId,
        statuses,
      }),
    });
  });

  r.post("/containers", ...tenantGate, requirePermission("container.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({
        customerId: z.string(),
        containerNo: z.string(),
        type: z.string(),
        direction: z.enum(["in", "out"]),
        status: z.enum(["yard", "sail", "clear", "hold", "empty"]).optional(),
        bl: z.string().optional(),
        yardCode: z.string().optional(),
        teu: z.number().int().optional(),
        eta: z.string().optional(),
        jobId: z.string().optional(),
        pol: z.string().optional(),
        pod: z.string().optional(),
        vessel: z.string().optional(),
        seal: z.string().optional(),
        commodity: z.string().optional(),
      })
      .parse(await c.req.json());
    try {
      const result = await createContainer(db, body);
      await writeAudit(db, { userId: user.id, action: "CONTAINER_CREATED", entityType: "container", entityId: result.id, newValue: result });
      return c.json(result, 201);
    } catch {
      return c.json({ error: "duplicate_container" }, 409);
    }
  });

  r.patch("/containers/:id", ...tenantGate, requirePermission("container.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({
        status: z.enum(["yard", "sail", "clear", "hold", "empty"]).optional(),
        yardCode: z.string().optional(),
        bl: z.string().optional(),
        eta: z.string().nullable().optional(),
        vessel: z.string().nullable().optional(),
      })
      .parse(await c.req.json());
    const existing = await getContainer(db, orgId(c), c.req.param("id"));
    if (!existing) return c.json({ error: "not_found" }, 404);
    const result = await updateContainer(db, c.req.param("id"), body);
    await writeAudit(db, { userId: user.id, action: "CONTAINER_UPDATED", entityType: "container", entityId: existing.id, newValue: result });
    return c.json(result);
  });

  r.get("/invoices", ...tenantGate, requirePermission("invoice.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listInvoices(db, orgId(c), c.req.query("customerId")) });
  });

  r.post("/invoices/from-job", ...tenantGate, requirePermission("invoice.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({ jobId: z.string(), customerId: z.string(), chargeIds: z.array(z.string()), paymentTermsDays: z.number().optional() })
      .parse(await c.req.json());
    try {
      const result = await createInvoiceFromJob(db, orgId(c), { ...body, createdBy: user.id });
      await writeAudit(db, { userId: user.id, action: "INVOICE_CREATED", entityType: "invoice", entityId: result.id, newValue: result });
      return c.json(result, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "job_not_found" || msg === "no_charges") return c.json({ error: msg }, 400);
      throw e;
    }
  });

  r.post("/invoices/:id/issue", ...tenantGate, requirePermission("invoice.issue"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    try {
      const result = await issueInvoice(db, orgId(c), id, user.id);
      await writeAudit(db, { userId: user.id, action: "INVOICE_ISSUED", entityType: "invoice", entityId: id, newValue: result });
      return c.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      throw e;
    }
  });

  r.post("/payments", ...tenantGate, requirePermission("payment.record"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({
        customerId: z.string(),
        amount: z.string(),
        currency: z.string(),
        method: z.string(),
        reference: z.string().optional(),
        allocations: z.array(z.object({ invoiceId: z.string(), amount: z.string() })),
      })
      .parse(await c.req.json());
    const result = await recordPayment(db, body);
    await writeAudit(db, { userId: user.id, action: "PAYMENT_RECORDED", entityType: "payment", entityId: result.id, newValue: result });
    return c.json(result, 201);
  });

  r.get("/finance/ar-summary", ...tenantGate, requirePermission("report.finance.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json(await getArSummary(db, orgId(c)));
  });

  r.get("/vendor-bills", ...tenantGate, requirePermission("vendor_bill.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const items = await listVendorBills(db, orgId(c), {
      vendorId: c.req.query("vendorId"),
      jobId: c.req.query("jobId"),
    });
    return c.json({ items });
  });

  r.get("/vendor-bills/:id", ...tenantGate, requirePermission("vendor_bill.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const result = await getVendorBill(db, orgId(c), c.req.param("id"));
    if (!result) return c.json({ error: "not_found" }, 404);
    return c.json(result);
  });

  r.post("/vendor-bills/from-job", ...tenantGate, requirePermission("vendor_bill.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({
        jobId: z.string(),
        vendorId: z.string(),
        chargeIds: z.array(z.string()).min(1),
        paymentTermsDays: z.number().optional(),
      })
      .parse(await c.req.json());
    try {
      const result = await createVendorBillFromJob(db, orgId(c), body);
      await writeAudit(db, {
        userId: user.id,
        action: "VENDOR_BILL_CREATED",
        entityType: "vendor_bill",
        entityId: result.id,
        newValue: result,
      });
      return c.json(result, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "no_charges" || msg === "job_not_found") return c.json({ error: msg }, 400);
      throw e;
    }
  });

  r.post("/vendor-bills/:id/approve", ...tenantGate, requirePermission("vendor_bill.approve"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    try {
      const result = await approveVendorBill(db, orgId(c), id, user.id);
      await writeAudit(db, {
        userId: user.id,
        action: "VENDOR_BILL_APPROVED",
        entityType: "vendor_bill",
        entityId: id,
        newValue: result,
      });
      return c.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      if (msg === "invalid_status") return c.json({ error: "invalid_status" }, 409);
      throw e;
    }
  });

  r.post("/vendor-bills/:id/pay", ...tenantGate, requirePermission("vendor_bill.approve"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const body = z.object({ partial: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
    try {
      const result = await payVendorBill(db, orgId(c), id, body);
      await writeAudit(db, {
        userId: user.id,
        action: "VENDOR_BILL_PAID",
        entityType: "vendor_bill",
        entityId: id,
        newValue: result,
      });
      return c.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      if (msg === "invalid_status") return c.json({ error: "invalid_status" }, 409);
      throw e;
    }
  });

  return r;
}

export function publicQuoteRoutes() {
  const r = new Hono();

  r.get("/quotes/:token", async (c) => {
    if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const quote = await getPublicQuotation(db, c.req.param("token"));
    if (!quote) return c.json({ error: "not_found" }, 404);
    return c.json(quote);
  });

  r.post("/quotes/:token/sign", async (c) => {
    if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
    const db = getDb();
    if (!db) return c.json({ error: "database_unavailable" }, 503);
    const body = z
      .object({
        signerName: z.string(),
        signerEmail: z.string().email(),
        signerCompany: z.string().optional(),
        signerPosition: z.string().optional(),
        signatureMethod: z.enum(["TYPED", "DRAWN"]),
        acceptedTerms: z.boolean(),
        decision: z.enum(["ACCEPTED", "REJECTED"]),
      })
      .parse(await c.req.json());
    try {
      const result = await signQuotation(db, c.req.param("token"), {
        ...body,
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
        userAgent: c.req.header("user-agent"),
      });
      await writeAudit(db, {
        action: body.decision === "ACCEPTED" ? "QUOTE_SIGNED" : "QUOTE_REJECTED",
        entityType: "quotation",
        entityId: c.req.param("token"),
        newValue: result,
      });
      return c.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "bad_request";
      return c.json({ error: msg }, 400);
    }
  });

  return r;
}
