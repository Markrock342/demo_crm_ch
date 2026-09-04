import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { shipmentCharges, jobs } from "../db/schema/operations.js";
import { billingNoteItems, billingNotes, invoiceLines, invoices, paymentAllocations, payments, vendorBillLines, vendorBills } from "../db/schema/finance.js";
import { customers } from "../db/schema/crm.js";
import { add, d, sub, toDb } from "../lib/money.js";
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

export async function listVendorBills(db: Db, organizationId: string, opts?: { vendorId?: string; jobId?: string }) {
  const clauses = [eq(jobs.organizationId, organizationId)];
  if (opts?.vendorId) clauses.push(eq(vendorBills.vendorId, opts.vendorId));
  if (opts?.jobId) clauses.push(eq(vendorBills.jobId, opts.jobId));
  const rows = await db
    .select({ bill: vendorBills })
    .from(vendorBills)
    .innerJoin(jobs, eq(vendorBills.jobId, jobs.id))
    .where(and(...clauses));
  return rows.map((r) => r.bill);
}

export async function getVendorBill(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select({ bill: vendorBills })
    .from(vendorBills)
    .innerJoin(jobs, eq(vendorBills.jobId, jobs.id))
    .where(and(eq(vendorBills.id, id), eq(jobs.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const lines = await db.select().from(vendorBillLines).where(eq(vendorBillLines.vendorBillId, id));
  return { bill: row.bill, lines };
}
