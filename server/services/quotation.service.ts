import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  approvalRequests,
  quotationCharges,
  quotationRevisions,
  quotations,
  quoteAcceptanceTokens,
  quoteSignatures,
  rateCharges,
  rateLanes,
} from "../db/schema/commercial.js";
import { approvalConfig } from "../db/schema/finance.js";
import { bookings, jobs, shipmentCharges } from "../db/schema/operations.js";
import { customers } from "../db/schema/crm.js";
import { canViewBuyRate, canViewMargin, type RoleCode } from "../domain/rbac.js";
import { add, d, grossProfit, marginPct, mul, sub, toDb } from "../lib/money.js";
import { nextDocNumber } from "./sequence.service.js";

export type QuotationChargeInput = {
  chargeCode: string;
  description: string;
  quantity: string;
  unit: string;
  buyRate: string;
  sellRate: string;
  currency: string;
  exchangeRate?: string;
};

function calcCharge(c: QuotationChargeInput) {
  const buyAmount = mul(c.quantity, c.buyRate);
  const sellAmount = mul(c.quantity, c.sellRate);
  const margin = sub(sellAmount, buyAmount);
  const marginPercentage = marginPct(sellAmount, buyAmount);
  return { buyAmount, sellAmount, margin, marginPercentage };
}

function hashSnapshot(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function listQuotations(db: Db, organizationId: string, customerId?: string) {
  const filters = [eq(quotations.organizationId, organizationId)];
  if (customerId) filters.push(eq(quotations.customerId, customerId));
  return db
    .select()
    .from(quotations)
    .where(and(...filters))
    .orderBy(desc(quotations.updatedAt));
}

export async function getQuotationDetail(db: Db, organizationId: string, id: string, roles: RoleCode[]) {
  const [q] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, organizationId)))
    .limit(1);
  if (!q) return null;
  const revisions = await db
    .select()
    .from(quotationRevisions)
    .where(eq(quotationRevisions.quotationId, id))
    .orderBy(desc(quotationRevisions.revisionNumber));
  const rev = revisions[0];
  if (!rev) return { quotation: q, revision: null, charges: [], totals: null };

  const charges = await db.select().from(quotationCharges).where(eq(quotationCharges.revisionId, rev.id));
  const showBuy = canViewBuyRate(roles);
  const showMargin = canViewMargin(roles);
  const totalBuy = add(...charges.map((c) => c.buyAmount));
  const totalSell = add(...charges.map((c) => c.sellAmount));
  return {
    quotation: q,
    revision: rev,
    charges: charges.map((c) => ({
      ...c,
      buyRate: showBuy ? c.buyRate : null,
      buyAmount: showBuy ? c.buyAmount : null,
      margin: showMargin ? c.margin : null,
      marginPercentage: showMargin ? c.marginPercentage : null,
    })),
    totals: {
      totalBuy: showBuy ? toDb(totalBuy) : null,
      totalSell: toDb(totalSell),
      grossProfit: showMargin ? toDb(grossProfit(totalSell, totalBuy)) : null,
      marginPct: showMargin ? toDb(marginPct(totalSell, totalBuy)) : null,
    },
  };
}

export async function createQuotationFromRate(
  db: Db,
  organizationId: string,
  input: {
    customerId: string;
    contactId?: string;
    opportunityId?: string;
    rateLaneId: string;
    quantity: number;
    salesOwnerId?: string;
    markupPct?: string;
    createdBy: string;
  },
) {
  const [cust] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!cust) throw new Error("customer_not_found");

  const [lane] = await db.select().from(rateLanes).where(eq(rateLanes.id, input.rateLaneId)).limit(1);
  if (!lane) throw new Error("rate_lane_not_found");
  const rateCh = await db.select().from(rateCharges).where(eq(rateCharges.rateLaneId, lane.id));
  const markup = d(input.markupPct ?? "15").dividedBy(100).plus(1);

  const chargeInputs: QuotationChargeInput[] = rateCh.map((c) => {
    const buy = d(c.unitPrice);
    const sellRate = c.side === "SELL" ? buy : buy.times(markup);
    return {
      chargeCode: c.chargeCode,
      description: c.description,
      quantity: String(input.quantity),
      unit: c.unit,
      buyRate: toDb(c.side === "BUY" ? buy : buy),
      sellRate: toDb(sellRate),
      currency: c.currency,
    };
  });

  if (!chargeInputs.length) {
    chargeInputs.push({
      chargeCode: "OCEAN_FREIGHT",
      description: "Ocean Freight",
      quantity: String(input.quantity),
      unit: "PER_CONTAINER",
      buyRate: "32000",
      sellRate: toDb(d("32000").times(markup)),
      currency: "THB",
    });
  }

  return createQuotation(db, {
    customerId: input.customerId,
    contactId: input.contactId,
    opportunityId: input.opportunityId,
    mode: lane.mode,
    origin: lane.origin,
    destination: lane.destination,
    pol: lane.pol,
    pod: lane.pod,
    containerType: lane.containerType ?? undefined,
    quantity: input.quantity,
    currency: "THB",
    salesOwnerId: input.salesOwnerId,
    charges: chargeInputs,
    createdBy: input.createdBy,
  });
}

export async function createQuotation(
  db: Db,
  input: {
    customerId: string;
    contactId?: string;
    opportunityId?: string;
    mode: string;
    origin: string;
    destination: string;
    pol: string;
    pod: string;
    containerType?: string;
    quantity: number;
    currency: string;
    salesOwnerId?: string;
    charges: QuotationChargeInput[];
    createdBy: string;
    notes?: string;
  },
) {
  const id = `qt${Date.now()}`;
  const number = await nextDocNumber(db, "QT", "QT");
  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const [cust] = await db
    .select({ organizationId: customers.organizationId })
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!cust) throw new Error("customer_not_found");

  await db.insert(quotations).values({
    id,
    organizationId: cust.organizationId,
    quotationNumber: number,
    customerId: input.customerId,
    contactId: input.contactId ?? null,
    opportunityId: input.opportunityId ?? null,
    mode: input.mode,
    origin: input.origin,
    destination: input.destination,
    pol: input.pol,
    pod: input.pod,
    containerType: input.containerType ?? null,
    quantity: input.quantity,
    currency: input.currency,
    validFrom: new Date(),
    validUntil,
    salesOwnerId: input.salesOwnerId ?? null,
    status: "DRAFT",
    currentRevision: 0,
    notes: input.notes ?? null,
  });

  const rev = await saveRevision(db, id, 0, input.charges, input.createdBy, "Initial draft");
  return { id, quotationNumber: number, revisionId: rev.id };
}

async function saveRevision(
  db: Db,
  quotationId: string,
  revisionNumber: number,
  charges: QuotationChargeInput[],
  createdBy: string,
  reason: string,
) {
  const revId = `qrev${Date.now()}${revisionNumber}`;
  const computed = charges.map((c) => ({ input: c, ...calcCharge(c) }));
  const totalBuy = add(...computed.map((x) => x.buyAmount));
  const totalSell = add(...computed.map((x) => x.sellAmount));
  const snapshot = {
    charges: computed.map((x) => x.input),
    totalBuy: toDb(totalBuy),
    totalSell: toDb(totalSell),
    grossProfit: toDb(grossProfit(totalSell, totalBuy)),
    marginPct: toDb(marginPct(totalSell, totalBuy)),
  };
  const documentHash = hashSnapshot(snapshot);

  await db.insert(quotationRevisions).values({
    id: revId,
    quotationId,
    revisionNumber,
    snapshot: JSON.stringify(snapshot),
    documentHash,
    reason,
    immutable: false,
    createdBy,
  });

  for (const [i, row] of computed.entries()) {
    await db.insert(quotationCharges).values({
      id: `qc${Date.now()}${i}`,
      revisionId: revId,
      chargeCode: row.input.chargeCode,
      description: row.input.description,
      quantity: row.input.quantity,
      unit: row.input.unit,
      buyRate: row.input.buyRate,
      sellRate: row.input.sellRate,
      currency: row.input.currency,
      exchangeRate: row.input.exchangeRate ?? "1",
      buyAmount: toDb(row.buyAmount),
      sellAmount: toDb(row.sellAmount),
      margin: toDb(row.margin),
      marginPercentage: toDb(row.marginPercentage),
    });
  }

  await db
    .update(quotations)
    .set({ currentRevision: revisionNumber, updatedAt: new Date() })
    .where(eq(quotations.id, quotationId));

  return { id: revId, documentHash, snapshot };
}

async function getApprovalThresholds(db: Db) {
  const rows = await db.select().from(approvalConfig);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    minMarginPct: d(map.min_margin_pct ?? "10"),
    maxValueWithoutApproval: d(map.max_value_without_approval ?? "500000"),
  };
}

export async function submitForApproval(db: Db, organizationId: string, quotationId: string, userId: string) {
  const detail = await getQuotationDetail(db, organizationId, quotationId, ["SUPER_ADMIN"]);
  if (!detail?.totals) throw new Error("not_found");
  const margin = d(detail.totals.marginPct ?? "0");
  const sell = d(detail.totals.totalSell ?? "0");
  const thresholds = await getApprovalThresholds(db);
  const needsApproval = margin.lt(thresholds.minMarginPct) || sell.gt(thresholds.maxValueWithoutApproval);

  if (needsApproval) {
    await db.insert(approvalRequests).values({
      id: `ap${Date.now()}`,
      entityType: "quotation",
      entityId: quotationId,
      requestedBy: userId,
      decision: null,
    });
    await db.update(quotations).set({ status: "PENDING_APPROVAL", updatedAt: new Date() }).where(eq(quotations.id, quotationId));
    return { status: "PENDING_APPROVAL", needsApproval: true };
  }

  await db.update(quotations).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(quotations.id, quotationId));
  return { status: "APPROVED", needsApproval: false };
}

export async function decideApproval(
  db: Db,
  organizationId: string,
  quotationId: string,
  approverId: string,
  decision: "APPROVED" | "REJECTED",
  comment?: string,
) {
  const [q] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)))
    .limit(1);
  if (!q) throw new Error("not_found");

  const [req] = await db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.entityType, "quotation"), eq(approvalRequests.entityId, quotationId)))
    .orderBy(desc(approvalRequests.requestedAt))
    .limit(1);
  if (!req) throw new Error("approval_not_found");

  await db
    .update(approvalRequests)
    .set({ approverId, decision, comment: comment ?? null, decidedAt: new Date() })
    .where(eq(approvalRequests.id, req.id));

  await db
    .update(quotations)
    .set({ status: decision === "APPROVED" ? "APPROVED" : "DRAFT", updatedAt: new Date() })
    .where(eq(quotations.id, quotationId));

  return { decision };
}

export async function sendQuotation(db: Db, organizationId: string, quotationId: string, sentBy: string) {
  const [q] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)))
    .limit(1);
  if (!q) throw new Error("not_found");
  if (!["APPROVED", "DRAFT"].includes(q.status) && q.status !== "SENT") {
    throw new Error("invalid_status");
  }

  const [rev] = await db
    .select()
    .from(quotationRevisions)
    .where(and(eq(quotationRevisions.quotationId, quotationId), eq(quotationRevisions.revisionNumber, q.currentRevision)))
    .limit(1);
  if (!rev) throw new Error("revision_not_found");

  await db.update(quotationRevisions).set({ immutable: true }).where(eq(quotationRevisions.id, rev.id));

  const token = randomBytes(32).toString("base64url");
  const tokenId = `qat${Date.now()}`;
  await db.insert(quoteAcceptanceTokens).values({
    id: tokenId,
    token,
    quotationId,
    revisionId: rev.id,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  await db
    .update(quotations)
    .set({ status: "SENT", sentAt: new Date(), sentBy, updatedAt: new Date() })
    .where(eq(quotations.id, quotationId));

  return { token, publicUrl: `/q/${token}` };
}

export async function getPublicQuotation(db: Db, token: string) {
  const [tok] = await db.select().from(quoteAcceptanceTokens).where(eq(quoteAcceptanceTokens.token, token)).limit(1);
  if (!tok || tok.revoked || tok.expiresAt < new Date()) return null;

  const [q] = await db.select().from(quotations).where(eq(quotations.id, tok.quotationId)).limit(1);
  const [rev] = await db.select().from(quotationRevisions).where(eq(quotationRevisions.id, tok.revisionId)).limit(1);
  if (!q || !rev) return null;

  const charges = await db
    .select({
      chargeCode: quotationCharges.chargeCode,
      description: quotationCharges.description,
      quantity: quotationCharges.quantity,
      unit: quotationCharges.unit,
      sellRate: quotationCharges.sellRate,
      sellAmount: quotationCharges.sellAmount,
      currency: quotationCharges.currency,
    })
    .from(quotationCharges)
    .where(eq(quotationCharges.revisionId, rev.id));

  const snapshot = JSON.parse(rev.snapshot) as { totalSell: string; marginPct?: string };
  return {
    quotationNumber: q.quotationNumber,
    revisionNumber: rev.revisionNumber,
    origin: q.origin,
    destination: q.destination,
    pol: q.pol,
    pod: q.pod,
    mode: q.mode,
    containerType: q.containerType,
    quantity: q.quantity,
    currency: q.currency,
    validUntil: q.validUntil,
    termsAndConditions: q.termsAndConditions,
    charges,
    totalSell: snapshot.totalSell,
    documentHash: rev.documentHash,
  };
}

export async function signQuotation(
  db: Db,
  token: string,
  input: {
    signerName: string;
    signerEmail: string;
    signerCompany?: string;
    signerPosition?: string;
    signatureMethod: "TYPED" | "DRAWN";
    acceptedTerms: boolean;
    decision: "ACCEPTED" | "REJECTED";
    ipAddress?: string;
    userAgent?: string;
  },
) {
  const pub = await getPublicQuotation(db, token);
  if (!pub) throw new Error("invalid_token");
  if (!input.acceptedTerms) throw new Error("terms_required");

  const [tok] = await db.select().from(quoteAcceptanceTokens).where(eq(quoteAcceptanceTokens.token, token)).limit(1);
  if (!tok) throw new Error("invalid_token");

  const eventId = `qev${Date.now()}`;
  const consentText =
    "I confirm that I am authorized to accept this quotation on behalf of my company and agree to the stated terms and charges.";

  await db.insert(quoteSignatures).values({
    id: `qs${Date.now()}`,
    acceptanceEventId: eventId,
    quotationId: tok.quotationId,
    revisionId: tok.revisionId,
    signerName: input.signerName,
    signerEmail: input.signerEmail,
    signerCompany: input.signerCompany ?? null,
    signerPosition: input.signerPosition ?? null,
    signatureMethod: input.signatureMethod,
    acceptedTerms: input.acceptedTerms,
    consentText,
    documentHash: pub.documentHash ?? "",
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    decision: input.decision,
  });

  await db
    .update(quotations)
    .set({
      status: input.decision === "ACCEPTED" ? "ACCEPTED" : "REJECTED",
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, tok.quotationId));

  return { eventId, decision: input.decision };
}

export async function createBookingFromQuotation(db: Db, organizationId: string, quotationId: string) {
  const [q] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)))
    .limit(1);
  if (!q || q.status !== "ACCEPTED") throw new Error("quotation_not_accepted");

  const [rev] = await db
    .select()
    .from(quotationRevisions)
    .where(and(eq(quotationRevisions.quotationId, quotationId), eq(quotationRevisions.revisionNumber, q.currentRevision)))
    .limit(1);

  const bookingNumber = await nextDocNumber(db, "BK", "BK");
  const id = `bk${Date.now()}`;
  await db.insert(bookings).values({
    id,
    bookingNumber,
    customerId: q.customerId,
    quotationId: q.id,
    quotationRevisionId: rev?.id ?? null,
    origin: q.origin,
    destination: q.destination,
    pol: q.pol,
    pod: q.pod,
    mode: q.mode,
    containerType: q.containerType,
    quantity: q.quantity,
    commodity: q.commodity,
    salesOwnerId: q.salesOwnerId,
    status: "CONFIRMED",
  });
  return { id, bookingNumber };
}

export async function createJobFromBooking(db: Db, organizationId: string, bookingId: string) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b) throw new Error("booking_not_found");

  const [cust] = await db
    .select({ organizationId: customers.organizationId })
    .from(customers)
    .where(and(eq(customers.id, b.customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!cust) throw new Error("booking_not_found");

  const jobNumber = await nextDocNumber(db, "JOB", "JOB");
  const id = `job${Date.now()}`;
  await db.insert(jobs).values({
    id,
    organizationId: cust.organizationId,
    jobNumber,
    customerId: b.customerId,
    bookingId: b.id,
    quotationId: b.quotationId,
    quotationRevisionId: b.quotationRevisionId,
    mode: b.mode,
    origin: b.origin,
    destination: b.destination,
    pol: b.pol,
    pod: b.pod,
    containerType: b.containerType,
    containerCount: b.quantity,
    teu: b.quantity * (b.containerType?.includes("20") ? 1 : 2),
    commodity: b.commodity,
    salesOwnerId: b.salesOwnerId,
    bookingNumber: b.bookingNumber,
    status: "BOOKING",
  });

  if (b.quotationRevisionId) {
    const qCharges = await db
      .select()
      .from(quotationCharges)
      .where(eq(quotationCharges.revisionId, b.quotationRevisionId));
    for (const [i, c] of qCharges.entries()) {
      await db.insert(shipmentCharges).values({
        id: `sc${Date.now()}${i}`,
        jobId: id,
        chargeCode: c.chargeCode,
        chargeType: "REVENUE",
        source: "QUOTATION",
        description: c.description,
        quantity: c.quantity,
        unit: c.unit,
        currency: c.currency,
        exchangeRate: c.exchangeRate,
        unitAmount: c.sellRate,
        totalAmount: c.sellAmount,
        quotedAmount: c.sellAmount,
        actualAmount: c.sellAmount,
        customerId: b.customerId,
      });
      await db.insert(shipmentCharges).values({
        id: `scc${Date.now()}${i}`,
        jobId: id,
        chargeCode: c.chargeCode,
        chargeType: "COST",
        source: "QUOTATION",
        description: `${c.description} (cost)`,
        quantity: c.quantity,
        unit: c.unit,
        currency: c.currency,
        exchangeRate: c.exchangeRate,
        unitAmount: c.buyRate,
        totalAmount: c.buyAmount,
        quotedAmount: c.buyAmount,
        actualAmount: c.buyAmount,
      });
    }
  }

  const { ensureJobMilestones } = await import("./milestone.service.js");
  await ensureJobMilestones(db, id);

  return { id, jobNumber };
}

export async function getJobFinancials(db: Db, organizationId: string, jobId: string, roles: RoleCode[]) {
  const { getJob } = await import("./operations.service.js");
  const job = await getJob(db, organizationId, jobId);
  if (!job) throw new Error("not_found");

  const charges = await db.select().from(shipmentCharges).where(eq(shipmentCharges.jobId, jobId));
  const showCost = canViewBuyRate(roles) || roles.includes("ACCOUNTING") || roles.includes("MANAGEMENT");
  const showMargin = canViewMargin(roles);

  const revenue = charges.filter((c) => c.chargeType === "REVENUE");
  const cost = charges.filter((c) => c.chargeType === "COST");
  const totalRevenue = add(...revenue.map((c) => c.actualAmount ?? c.totalAmount));
  const totalCost = add(...cost.map((c) => c.actualAmount ?? c.totalAmount));

  return {
    revenue: revenue.map((c) => ({ ...c, chargeType: undefined })),
    cost: showCost ? cost : [],
    totalRevenue: toDb(totalRevenue),
    totalCost: showCost ? toDb(totalCost) : null,
    grossProfit: showMargin ? toDb(grossProfit(totalRevenue, totalCost)) : null,
    marginPct: showMargin ? toDb(marginPct(totalRevenue, totalCost)) : null,
  };
}
