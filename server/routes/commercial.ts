import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import { createInvoiceFromJob, createBillingNote, getArSummary, getInvoice, issueInvoice, listBillingNotes, listInvoices, listPayments, recordPayment } from "../services/finance.service.js";
import { getJob, listBookingsByQuotation, listJobCharges, listJobs, updateChargeActual } from "../services/operations.service.js";
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

export function commercialRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.get("/vendors", requireAuth(), requirePermission("rate.view_sell"), async (c) => {
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

  r.get("/quotations", requireAuth(), requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const customerId = c.req.query("customerId");
    return c.json({ items: await listQuotations(db, customerId) });
  });

  r.get("/quotations/:id/pdf", requireAuth(), requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    try {
      const bytes = await generateQuotationPdf(db, c.req.param("id"));
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

  r.get("/quotations/:id/bookings", requireAuth(), requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listBookingsByQuotation(db, c.req.param("id")) });
  });

  r.get("/jobs", requireAuth(), requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listJobs(db, c.req.query("customerId")) });
  });

  r.get("/jobs/:id", requireAuth(), requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const job = await getJob(db, c.req.param("id"));
    if (!job) return c.json({ error: "not_found" }, 404);
    return c.json(job);
  });

  r.get("/jobs/:id/charges", requireAuth(), requirePermission("finance.revenue.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listJobCharges(db, c.req.param("id")) });
  });

  r.patch("/jobs/:id/charges/:chargeId", requireAuth(), requirePermission("finance.cost.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const { actualAmount } = z.object({ actualAmount: z.string() }).parse(await c.req.json());
    const row = await updateChargeActual(db, c.req.param("chargeId"), actualAmount);
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

  r.get("/invoices/:id", requireAuth(), requirePermission("invoice.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const row = await getInvoice(db, c.req.param("id"));
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  });

  r.post("/billing-notes", requireAuth(), requirePermission("billing.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z.object({ customerId: z.string(), invoiceIds: z.array(z.string()).min(1) }).parse(await c.req.json());
    const result = await createBillingNote(db, body);
    await writeAudit(db, {
      userId: user.id,
      action: "BILLING_NOTE_CREATED",
      entityType: "billing_note",
      entityId: result.id,
      newValue: result,
    });
    return c.json(result, 201);
  });

  r.get("/billing-notes", requireAuth(), requirePermission("billing.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listBillingNotes(db, c.req.query("customerId")) });
  });

  r.get("/billing-notes/:id/pdf", requireAuth(), requirePermission("billing.view"), async (c) => {
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

  r.get("/payments", requireAuth(), requirePermission("payment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listPayments(db, c.req.query("customerId")) });
  });

  r.get("/quotations/:id", requireAuth(), requirePermission("quotation.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const detail = await getQuotationDetail(db, c.req.param("id"), roles(c));
    if (!detail) return c.json({ error: "not_found" }, 404);
    return c.json(detail);
  });

  r.post("/quotations/from-rate", requireAuth(), requirePermission("quotation.create"), async (c) => {
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
    const result = await createQuotationFromRate(db, { ...body, createdBy: user.id, salesOwnerId: user.id });
    await writeAudit(db, { userId: user.id, action: "QUOTE_CREATED", entityType: "quotation", entityId: result.id, newValue: result });
    return c.json(result, 201);
  });

  r.post("/quotations/:id/submit-approval", requireAuth(), requirePermission("quotation.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const result = await submitForApproval(db, id, user.id);
    await writeAudit(db, { userId: user.id, action: "QUOTE_APPROVAL_REQUESTED", entityType: "quotation", entityId: id, newValue: result });
    return c.json(result);
  });

  r.post("/quotations/:id/approve", requireAuth(), requirePermission("quotation.approve"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), comment: z.string().optional() }).parse(await c.req.json());
    const id = c.req.param("id");
    const result = await decideApproval(db, id, user.id, body.decision, body.comment);
    await writeAudit(db, {
      userId: user.id,
      action: body.decision === "APPROVED" ? "QUOTE_APPROVED" : "QUOTE_REJECTED",
      entityType: "quotation",
      entityId: id,
      newValue: result,
    });
    return c.json(result);
  });

  r.post("/quotations/:id/send", requireAuth(), requirePermission("quotation.send"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const result = await sendQuotation(db, id, user.id);
    await writeAudit(db, { userId: user.id, action: "QUOTE_SENT", entityType: "quotation", entityId: id, newValue: result });
    return c.json(result);
  });

  r.post("/quotations/:id/booking", requireAuth(), requirePermission("quotation.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const result = await createBookingFromQuotation(db, id);
    await writeAudit(db, { userId: user.id, action: "BOOKING_CREATED", entityType: "booking", entityId: result.id, newValue: result });
    return c.json(result, 201);
  });

  r.post("/bookings/:id/job", requireAuth(), requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const result = await createJobFromBooking(db, c.req.param("id"));
    await writeAudit(db, { userId: user.id, action: "SHIPMENT_CREATED", entityType: "job", entityId: result.id, newValue: result });
    return c.json(result, 201);
  });

  r.get("/jobs/:id/financials", requireAuth(), requirePermission("finance.revenue.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json(await getJobFinancials(db, c.req.param("id"), roles(c)));
  });

  r.get("/invoices", requireAuth(), requirePermission("invoice.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json({ items: await listInvoices(db, c.req.query("customerId")) });
  });

  r.post("/invoices/from-job", requireAuth(), requirePermission("invoice.create"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const body = z
      .object({ jobId: z.string(), customerId: z.string(), chargeIds: z.array(z.string()), paymentTermsDays: z.number().optional() })
      .parse(await c.req.json());
    const result = await createInvoiceFromJob(db, { ...body, createdBy: user.id });
    await writeAudit(db, { userId: user.id, action: "INVOICE_CREATED", entityType: "invoice", entityId: result.id, newValue: result });
    return c.json(result, 201);
  });

  r.post("/invoices/:id/issue", requireAuth(), requirePermission("invoice.issue"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const user = c.get("user")!;
    const id = c.req.param("id");
    const result = await issueInvoice(db, id, user.id);
    await writeAudit(db, { userId: user.id, action: "INVOICE_ISSUED", entityType: "invoice", entityId: id, newValue: result });
    return c.json(result);
  });

  r.post("/payments", requireAuth(), requirePermission("payment.record"), async (c) => {
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

  r.get("/finance/ar-summary", requireAuth(), requirePermission("report.finance.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    return c.json(await getArSummary(db));
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
