import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { shipmentCharges, jobs } from "../db/schema/operations.js";
import { billingNoteItems, billingNotes, invoiceLines, invoices, paymentAllocations, payments, taxCodes, vendorBillLines, vendorBills } from "../db/schema/finance.js";
import { customers } from "../db/schema/crm.js";
import { vendors } from "../db/schema/commercial.js";
import { add, d, mul, sub, toDb } from "../lib/money.js";
import { nextDocNumber } from "./sequence.service.js";
import { getJob } from "./operations.service.js";

export async function createInvoiceFromJob(
  db: Db,
  organizationId: string,
  input: { jobId: string; customerId: string; chargeIds: string[]; createdBy: string; paymentTermsDays?: number },
) {
  const job = await getJob(db, organizationId, input.jobId);
  if (!job) throw new Error("job_not_found");

  const charges = await db
    .select()
    .from(shipmentCharges)
    .where(and(eq(shipmentCharges.jobId, input.jobId), eq(shipmentCharges.chargeType, "REVENUE")));

  const selected = charges.filter((c) => input.chargeIds.includes(c.id) && !c.invoiced);
  if (!selected.length) throw new Error("no_charges");

  const subtotal = add(...selected.map((c) => c.actualAmount ?? c.totalAmount));
  const tax = d(0);
  const total = subtotal.plus(tax);
  const invoiceNumber = await nextDocNumber(db, "INV", "INV");
  const id = `inv${Date.now()}`;
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + (input.paymentTermsDays ?? 30) * 24 * 60 * 60 * 1000);

  const [jobRow] = await db
    .select({ organizationId: jobs.organizationId })
    .from(jobs)
    .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, organizationId)))
    .limit(1);
  if (!jobRow) throw new Error("job_not_found");

  await db.insert(invoices).values({
    id,
    organizationId: jobRow.organizationId,
    invoiceNumber,
    customerId: input.customerId,
    jobId: input.jobId,
    issueDate,
    dueDate,
    currency: selected[0]?.currency ?? "THB",
    exchangeRate: selected[0]?.exchangeRate ?? "1",
    subtotal: toDb(subtotal),
    tax: toDb(tax),
    total: toDb(total),
    paidAmount: "0",
    balanceDue: toDb(total),
    paymentTermsDays: input.paymentTermsDays ?? 30,
    status: "DRAFT",
    createdBy: input.createdBy,
    snapshot: JSON.stringify({ chargeIds: selected.map((c) => c.id) }),
  });

  for (const [i, c] of selected.entries()) {
    await db.insert(invoiceLines).values({
      id: `il${Date.now()}${i}`,
      invoiceId: id,
      chargeId: c.id,
      description: c.description,
      quantity: c.quantity,
      unitAmount: c.unitAmount,
      amount: c.actualAmount ?? c.totalAmount,
      currency: c.currency,
    });
    await db.update(shipmentCharges).set({ invoiced: true }).where(eq(shipmentCharges.id, c.id));
  }

  return { id, invoiceNumber, total: toDb(total) };
}

export async function issueInvoice(db: Db, organizationId: string, invoiceId: string, issuedBy: string) {
  const inv = await getInvoice(db, organizationId, invoiceId);
  if (!inv) throw new Error("not_found");
  await db
    .update(invoices)
    .set({ status: "ISSUED", issuedBy, issuedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)));
  return { status: "ISSUED" };
}

export async function recordPayment(
  db: Db,
  input: {
    customerId: string;
    amount: string;
    currency: string;
    method: string;
    reference?: string;
    allocations: Array<{ invoiceId: string; amount: string }>;
  },
) {
  const paymentNumber = await nextDocNumber(db, "PAY", "PAY");
  const id = `pay${Date.now()}`;
  await db.insert(payments).values({
    id,
    paymentNumber,
    customerId: input.customerId,
    paymentDate: new Date(),
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    reference: input.reference ?? null,
    status: "RECORDED",
  });

  for (const [i, a] of input.allocations.entries()) {
    await db.insert(paymentAllocations).values({
      id: `pa${Date.now()}${i}`,
      paymentId: id,
      invoiceId: a.invoiceId,
      amount: a.amount,
    });

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, a.invoiceId)).limit(1);
    if (!inv) continue;
    const paid = add(inv.paidAmount, a.amount);
    const balance = sub(inv.total, paid);
    let status = "PARTIALLY_PAID";
    if (balance.lte(0)) status = "PAID";
    await db
      .update(invoices)
      .set({
        paidAmount: toDb(paid),
        balanceDue: toDb(balance.lt(0) ? 0 : balance),
        status,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, a.invoiceId));
  }

  return { id, paymentNumber };
}

export async function getArSummary(db: Db, organizationId: string) {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.status, "ISSUED")));
  const partial = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.organizationId, organizationId), eq(invoices.status, "PARTIALLY_PAID")));
  const all = [...rows, ...partial];
  const now = new Date();
  const buckets = { notDue: d(0), d1_30: d(0), d31_60: d(0), d61_90: d(0), d90plus: d(0) };
  for (const inv of all) {
    const bal = d(inv.balanceDue);
    const days = Math.floor((now.getTime() - inv.dueDate.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 0) buckets.notDue = buckets.notDue.plus(bal);
    else if (days <= 30) buckets.d1_30 = buckets.d1_30.plus(bal);
    else if (days <= 60) buckets.d31_60 = buckets.d31_60.plus(bal);
    else if (days <= 90) buckets.d61_90 = buckets.d61_90.plus(bal);
    else buckets.d90plus = buckets.d90plus.plus(bal);
  }
  return {
    notDue: toDb(buckets.notDue),
    d1_30: toDb(buckets.d1_30),
    d31_60: toDb(buckets.d31_60),
    d61_90: toDb(buckets.d61_90),
    d90plus: toDb(buckets.d90plus),
    total: toDb(add(buckets.notDue, buckets.d1_30, buckets.d31_60, buckets.d61_90, buckets.d90plus)),
  };
}

export async function listInvoices(db: Db, organizationId: string, customerId?: string) {
  const filters = [eq(invoices.organizationId, organizationId)];
  if (customerId) filters.push(eq(invoices.customerId, customerId));
  return db
    .select()
    .from(invoices)
    .where(and(...filters));
}

export async function getInvoice(db: Db, organizationId: string, id: string) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!inv) return null;
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  return { invoice: inv, lines };
}

export async function createBillingNote(db: Db, organizationId: string, input: { customerId: string; invoiceIds: string[] }) {
  const invRows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.customerId, input.customerId),
        eq(invoices.organizationId, organizationId),
        inArray(invoices.id, input.invoiceIds),
      ),
    );

  if (!invRows.length) throw new Error("no_invoices");

  const subtotal = add(...invRows.map((i) => i.balanceDue));
  const billingNumber = await nextDocNumber(db, "BN", "BN");
  const id = `bn${Date.now()}`;
  const currency = invRows[0]?.currency ?? "THB";

  await db.insert(billingNotes).values({
    id,
    billingNumber,
    customerId: input.customerId,
    billingDate: new Date(),
    scheduledPaymentDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    currency,
    subtotal: toDb(subtotal),
    grandTotal: toDb(subtotal),
    status: "ISSUED",
    snapshot: JSON.stringify({ invoiceIds: input.invoiceIds }),
  });

  for (const [i, inv] of invRows.entries()) {
    await db.insert(billingNoteItems).values({
      id: `bni${Date.now()}${i}`,
      billingNoteId: id,
      invoiceId: inv.id,
      amount: inv.balanceDue,
    });
  }

  return { id, billingNumber, grandTotal: toDb(subtotal), currency };
}

export async function listBillingNotes(db: Db, organizationId: string, customerId?: string) {
  const clauses = [eq(customers.organizationId, organizationId)];
  if (customerId) clauses.push(eq(billingNotes.customerId, customerId));
  const rows = await db
    .select({ note: billingNotes })
    .from(billingNotes)
    .innerJoin(customers, eq(billingNotes.customerId, customers.id))
    .where(and(...clauses));
  return rows.map((r) => r.note);
}

export async function listPayments(db: Db, organizationId: string, customerId?: string) {
  const clauses = [eq(customers.organizationId, organizationId)];
  if (customerId) clauses.push(eq(payments.customerId, customerId));
  const rows = await db
    .select({ payment: payments })
    .from(payments)
    .innerJoin(customers, eq(payments.customerId, customers.id))
    .where(and(...clauses));
  return rows.map((r) => r.payment);
}

export function selectBillableCostCharges<T extends { id: string; chargeType: string; billed: boolean }>(
  charges: T[],
  chargeIds: string[],
): T[] {
  return charges.filter((c) => c.chargeType === "COST" && chargeIds.includes(c.id) && !c.billed);
}

export async function createVendorBillFromJob(
  db: Db,
  organizationId: string,
  input: { jobId: string; vendorId: string; chargeIds: string[]; paymentTermsDays?: number },
) {
  const job = await getJob(db, organizationId, input.jobId);
  if (!job) throw new Error("job_not_found");

  const charges = await db
    .select()
    .from(shipmentCharges)
    .where(and(eq(shipmentCharges.jobId, input.jobId), eq(shipmentCharges.chargeType, "COST")));

  const selected = selectBillableCostCharges(charges, input.chargeIds);
  if (!selected.length) throw new Error("no_charges");

  const subtotal = add(...selected.map((c) => c.actualAmount ?? c.totalAmount));
  const tax = d(0);
  const total = subtotal.plus(tax);
  const billNumber = await nextDocNumber(db, "VB", "VB");
  const id = `vb${Date.now()}`;
  const billDate = new Date();
  const dueDate = new Date(billDate.getTime() + (input.paymentTermsDays ?? 30) * 24 * 60 * 60 * 1000);

  await db.insert(vendorBills).values({
    id,
    organizationId,
    vendorId: input.vendorId,
    jobId: input.jobId,
    billNumber,
    billDate,
    dueDate,
    currency: selected[0]?.currency ?? "THB",
    subtotal: toDb(subtotal),
    tax: toDb(tax),
    total: toDb(total),
    status: "DRAFT",
  });

  for (const [i, c] of selected.entries()) {
    await db.insert(vendorBillLines).values({
      id: `vbl${Date.now()}${i}`,
      vendorBillId: id,
      chargeId: c.id,
      description: c.description,
      amount: c.actualAmount ?? c.totalAmount,
      currency: c.currency,
    });
    await db.update(shipmentCharges).set({ billed: true, updatedAt: new Date() }).where(eq(shipmentCharges.id, c.id));
  }

  return { id, billNumber, total: toDb(total), status: "DRAFT" as const };
}

export async function approveVendorBill(db: Db, organizationId: string, billId: string, approvedBy: string) {
  const result = await getVendorBill(db, organizationId, billId);
  if (!result) throw new Error("not_found");
  const bill = result.bill;
  if (bill.status !== "DRAFT") throw new Error("invalid_status");
  await db
    .update(vendorBills)
    .set({ status: "APPROVED", approvedBy, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(vendorBills.id, billId));
  return { status: "APPROVED" as const };
}

export async function payVendorBill(db: Db, organizationId: string, billId: string, opts?: { partial?: boolean }) {
  const result = await getVendorBill(db, organizationId, billId);
  if (!result) throw new Error("not_found");
  const bill = result.bill;
  if (bill.status !== "APPROVED" && bill.status !== "PARTIAL") throw new Error("invalid_status");
  const status = opts?.partial ? "PARTIAL" : "PAID";
  await db.update(vendorBills).set({ status, updatedAt: new Date() }).where(eq(vendorBills.id, billId));
  return { status };
}

/** Tenant filter for vendor bills: own column, or (legacy rows) the linked job's tenant. */
function vendorBillOrgClause(organizationId: string) {
  return or(
    eq(vendorBills.organizationId, organizationId),
    and(isNull(vendorBills.organizationId), eq(jobs.organizationId, organizationId)),
  )!;
}

export async function listVendorBills(db: Db, organizationId: string, opts?: { vendorId?: string; jobId?: string }) {
  const clauses = [vendorBillOrgClause(organizationId)];
  if (opts?.vendorId) clauses.push(eq(vendorBills.vendorId, opts.vendorId));
  if (opts?.jobId) clauses.push(eq(vendorBills.jobId, opts.jobId));
  const rows = await db
    .select({ bill: vendorBills })
    .from(vendorBills)
    .leftJoin(jobs, eq(vendorBills.jobId, jobs.id))
    .where(and(...clauses));
  return rows.map((r) => r.bill);
}

export async function getVendorBill(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select({ bill: vendorBills })
    .from(vendorBills)
    .leftJoin(jobs, eq(vendorBills.jobId, jobs.id))
    .where(and(eq(vendorBills.id, id), vendorBillOrgClause(organizationId)))
    .limit(1);
  if (!row) return null;
  const lines = await db.select().from(vendorBillLines).where(eq(vendorBillLines.vendorBillId, id));
  return { bill: row.bill, lines };
}

// ── Create finance documents from scratch (no job charges required) ──

export type ManualLineInput = {
  description: string;
  qty: string | number;
  unitPrice: string | number;
  taxCode?: string | null;
};

export type ComputedLine = {
  description: string;
  quantity: string;
  unitAmount: string;
  amount: string;
  tax: string;
  taxCode: string | null;
};

/**
 * Pure money maths for manual invoice / bill lines.
 * amount = qty × unitPrice (2 dp), tax = amount × rate(taxCode) (2 dp, per line).
 * Throws `invalid_tax_code` for a code missing from `taxRates`, `invalid_line` for qty ≤ 0 or unitPrice < 0.
 */
export function computeManualLines(lines: ManualLineInput[], taxRates: Map<string, string>) {
  if (!lines.length) throw new Error("no_lines");
  const out: ComputedLine[] = lines.map((l) => {
    const qty = d(l.qty);
    const unit = d(l.unitPrice);
    if (!qty.isFinite() || !unit.isFinite() || qty.lte(0) || unit.lt(0)) throw new Error("invalid_line");
    const amount = mul(qty, unit).toDecimalPlaces(2);
    const code = l.taxCode?.trim() || null;
    let tax = d(0);
    if (code) {
      const rate = taxRates.get(code);
      if (rate === undefined) throw new Error("invalid_tax_code");
      tax = mul(amount, rate).toDecimalPlaces(2);
    }
    return {
      description: l.description.trim(),
      quantity: toDb(qty),
      unitAmount: toDb(unit),
      amount: toDb(amount),
      tax: toDb(tax),
      taxCode: code,
    };
  });
  const subtotal = add(...out.map((l) => l.amount));
  const tax = add(...out.map((l) => l.tax));
  return { lines: out, subtotal: toDb(subtotal), tax: toDb(tax), total: toDb(subtotal.plus(tax)) };
}

async function loadTaxRates(db: Db, lines: ManualLineInput[]) {
  const codes = [...new Set(lines.map((l) => l.taxCode?.trim()).filter((c): c is string => Boolean(c)))];
  const map = new Map<string, string>();
  if (!codes.length) return map;
  const rows = await db.select().from(taxCodes).where(inArray(taxCodes.code, codes));
  for (const r of rows) map.set(r.code, r.rate);
  return map;
}

function docId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
}

function parseDueDate(input: string | undefined, fallbackDays: number, from: Date) {
  if (input) {
    const due = new Date(input);
    if (Number.isNaN(due.getTime())) throw new Error("invalid_due_date");
    return due;
  }
  return new Date(from.getTime() + fallbackDays * 24 * 60 * 60 * 1000);
}

export async function createInvoice(
  db: Db,
  organizationId: string,
  input: {
    customerId: string;
    jobId?: string | null;
    currency: string;
    dueDate?: string;
    paymentTermsDays?: number;
    notes?: string;
    lines: ManualLineInput[];
    createdBy: string;
  },
) {
  const [cust] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!cust) throw new Error("customer_not_found");
  if (input.jobId) {
    const job = await getJob(db, organizationId, input.jobId);
    if (!job) throw new Error("job_not_found");
    if (job.customerId !== input.customerId) throw new Error("job_customer_mismatch");
  }

  const totals = computeManualLines(input.lines, await loadTaxRates(db, input.lines));
  const issueDate = new Date();
  const terms = input.paymentTermsDays ?? 30;
  const dueDate = parseDueDate(input.dueDate, terms, issueDate);
  const invoiceNumber = await nextDocNumber(db, "INV", "INV");
  const id = docId("inv");
  const currency = input.currency.toUpperCase();

  await db.transaction(async (tx) => {
    await tx.insert(invoices).values({
      id,
      organizationId,
      invoiceNumber,
      customerId: input.customerId,
      jobId: input.jobId ?? null,
      issueDate,
      dueDate,
      currency,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      paidAmount: "0",
      balanceDue: totals.total,
      paymentTermsDays: terms,
      notes: input.notes ?? null,
      status: "DRAFT",
      createdBy: input.createdBy,
      snapshot: JSON.stringify({ source: "MANUAL" }),
    });
    await tx.insert(invoiceLines).values(
      totals.lines.map((l, i) => ({
        id: `${id}-l${i}`,
        invoiceId: id,
        chargeId: null,
        description: l.description,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        amount: l.amount,
        currency,
        taxCode: l.taxCode,
      })),
    );
  });

  return { id, invoiceNumber, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, currency, status: "DRAFT" as const };
}

export async function createVendorBill(
  db: Db,
  organizationId: string,
  input: {
    vendorId: string;
    jobId?: string | null;
    currency: string;
    dueDate?: string;
    lines: ManualLineInput[];
  },
) {
  const [vendor] = await db
    .select({ id: vendors.id, paymentTermsDays: vendors.paymentTermsDays })
    .from(vendors)
    .where(and(eq(vendors.id, input.vendorId), eq(vendors.organizationId, organizationId)))
    .limit(1);
  if (!vendor) throw new Error("vendor_not_found");
  if (input.jobId) {
    const job = await getJob(db, organizationId, input.jobId);
    if (!job) throw new Error("job_not_found");
  }

  const totals = computeManualLines(input.lines, await loadTaxRates(db, input.lines));
  const billDate = new Date();
  const dueDate = parseDueDate(input.dueDate, vendor.paymentTermsDays ?? 30, billDate);
  const billNumber = await nextDocNumber(db, "VB", "VB");
  const id = docId("vb");
  const currency = input.currency.toUpperCase();

  await db.transaction(async (tx) => {
    await tx.insert(vendorBills).values({
      id,
      organizationId,
      vendorId: input.vendorId,
      jobId: input.jobId ?? null,
      billNumber,
      billDate,
      dueDate,
      currency,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      status: "DRAFT",
    });
    await tx.insert(vendorBillLines).values(
      totals.lines.map((l, i) => ({
        id: `${id}-l${i}`,
        vendorBillId: id,
        chargeId: null,
        description: l.description,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        taxCode: l.taxCode,
        amount: l.amount,
        currency,
      })),
    );
  });

  return { id, billNumber, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, currency, status: "DRAFT" as const };
}
