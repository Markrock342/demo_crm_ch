import { inArray } from "drizzle-orm";
import type { Db } from "./index.js";
import { users } from "./schema/auth.js";
import {
  billingNoteItems,
  billingNotes,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  taxCodes,
  vendorBillLines,
  vendorBills,
} from "./schema/finance.js";
import { jobs, shipmentCharges } from "./schema/operations.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { computeManualLines } from "../services/finance.service.js";
import { nextDocNumber } from "../services/sequence.service.js";
import { add, d, sub, toDb } from "../lib/money.js";
import { bangkokDate, demoJobCharges, demoJobsForSeed, type DemoCharge } from "./seed-operations.js";

/**
 * Demo finance data: customer invoices across every AR state (draft, not due, due this week,
 * overdue 1–30 / 31–60 / 60+, partially paid, paid), payments with allocations, billing notes,
 * and vendor bills (draft / approved / partial / paid / overdue).
 *
 * Every row has a stable id ("inv-seed-01", "vb-seed-01", …). Document numbers come from
 * doc_sequences on first insert and are kept afterwards, so re-running the seed refreshes
 * amounts / dates / statuses in place and never duplicates. User-created rows are never touched.
 * Dates are offsets in days from today (Bangkok calendar).
 */

type Part = "freight" | "local" | "all";

type InvoiceSpec = {
  id: string;
  jobId: string;
  part: Part;
  issue: number;
  terms: number;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID";
  notes?: string;
};

const INVOICES: InvoiceSpec[] = [
  // Overdue 60+ days (old delivered job) — freight still open, local charges paid
  { id: "inv-seed-01", jobId: "s21", part: "freight", issue: -98, terms: 30, status: "ISSUED" },
  { id: "inv-seed-02", jobId: "s21", part: "local", issue: -98, terms: 30, status: "PAID" },
  // Overdue 31–60 days (partly paid); freight paid, late local-charges invoice overdue 1–30 days
  { id: "inv-seed-03", jobId: "s19", part: "all", issue: -78, terms: 30, status: "PARTIALLY_PAID" },
  { id: "inv-seed-04", jobId: "s20", part: "freight", issue: -73, terms: 30, status: "PAID" },
  { id: "inv-seed-05", jobId: "s20", part: "local", issue: -45, terms: 30, status: "ISSUED" },
  // Overdue 1–30 days (THB)
  { id: "inv-seed-06", jobId: "s11", part: "all", issue: -40, terms: 30, status: "ISSUED" },
  { id: "inv-seed-07", jobId: "s22", part: "freight", issue: -36, terms: 30, status: "ISSUED" },
  { id: "inv-seed-08", jobId: "s22", part: "local", issue: -36, terms: 30, status: "PAID" },
  // Issued, not due yet
  { id: "inv-seed-09", jobId: "s18", part: "all", issue: -6, terms: 30, status: "ISSUED" },
  // Due within 7 days
  { id: "inv-seed-10", jobId: "s6", part: "all", issue: -25, terms: 30, status: "ISSUED" },
  { id: "inv-seed-11", jobId: "s3", part: "all", issue: -27, terms: 30, status: "ISSUED" },
  { id: "inv-seed-12", jobId: "s10", part: "all", issue: -24, terms: 30, status: "ISSUED" },
  // Issued, not due yet
  { id: "inv-seed-13", jobId: "s2", part: "all", issue: -4, terms: 30, status: "ISSUED" },
  { id: "inv-seed-14", jobId: "s7", part: "all", issue: -3, terms: 30, status: "ISSUED" },
  { id: "inv-seed-15", jobId: "s8", part: "all", issue: -2, terms: 15, status: "ISSUED" },
  // Deposit received, balance not due
  { id: "inv-seed-16", jobId: "s1", part: "freight", issue: -5, terms: 30, status: "PARTIALLY_PAID" },
  // Prepaid freight
  { id: "inv-seed-17", jobId: "s17", part: "freight", issue: -8, terms: 7, status: "PAID" },
  // Drafts waiting for review
  { id: "inv-seed-18", jobId: "s17", part: "local", issue: -1, terms: 30, status: "DRAFT" },
  { id: "inv-seed-19", jobId: "s16", part: "all", issue: 0, terms: 30, status: "DRAFT" },
  { id: "inv-seed-20", jobId: "s15", part: "all", issue: -1, terms: 30, status: "DRAFT" },
  // THB export, not due
  { id: "inv-seed-21", jobId: "s14", part: "all", issue: -2, terms: 15, status: "ISSUED" },
  // Prepaid freight (export)
  { id: "inv-seed-22", jobId: "s9", part: "freight", issue: -6, terms: 7, status: "PAID" },
];

type PaymentSpec = {
  id: string;
  day: number;
  method: "BANK_TRANSFER" | "CHEQUE" | "CASH";
  reference: string;
  bankReference?: string;
  /** Invoice id → share of its total (1 = full). */
  allocations: Array<{ invoiceId: string; share: number }>;
};

const PAYMENTS: PaymentSpec[] = [
  { id: "pay-seed-01", day: -70, method: "BANK_TRANSFER", reference: "TT HY-0612", bankReference: "BBL 2026-0612-8841", allocations: [{ invoiceId: "inv-seed-02", share: 1 }] },
  { id: "pay-seed-02", day: -50, method: "BANK_TRANSFER", reference: "TT SA-0808", bankReference: "KBANK 2026-0808-1172", allocations: [{ invoiceId: "inv-seed-03", share: 0.4 }] },
  { id: "pay-seed-03", day: -45, method: "CHEQUE", reference: "CHQ 00418822", bankReference: "SCB 00418822", allocations: [{ invoiceId: "inv-seed-04", share: 1 }] },
  { id: "pay-seed-04", day: -20, method: "BANK_TRANSFER", reference: "TT SPL-0908", bankReference: "KTB 2026-0908-5530", allocations: [{ invoiceId: "inv-seed-08", share: 1 }] },
  { id: "pay-seed-05", day: -2, method: "BANK_TRANSFER", reference: "TT NS-DEP50", bankReference: "BBL 2026-0926-0457", allocations: [{ invoiceId: "inv-seed-16", share: 0.5 }] },
  { id: "pay-seed-06", day: -1, method: "BANK_TRANSFER", reference: "TT HY-PREPAID", bankReference: "BBL 2026-0927-3316", allocations: [{ invoiceId: "inv-seed-17", share: 1 }] },
  { id: "pay-seed-07", day: -3, method: "BANK_TRANSFER", reference: "TT SPL-PREPAID", bankReference: "KBANK 2026-0925-2208", allocations: [{ invoiceId: "inv-seed-22", share: 1 }] },
];

const BILLING_NOTES = [
  { id: "bn-seed-01", customerId: "c1", invoiceIds: ["inv-seed-01", "inv-seed-11"], day: -2, payIn: 12 },
  { id: "bn-seed-02", customerId: "c7", invoiceIds: ["inv-seed-03", "inv-seed-12"], day: -3, payIn: 7 },
  { id: "bn-seed-03", customerId: "c10", invoiceIds: ["inv-seed-07"], day: -5, payIn: 5 },
];

type BillSpec = {
  id: string;
  vendorId: string;
  jobId: string;
  codes: string[];
  bill: number;
  due: number;
  status: "DRAFT" | "APPROVED" | "PARTIAL" | "PAID";
};

const VENDOR_BILLS: BillSpec[] = [
  { id: "vb-seed-01", vendorId: "v2", jobId: "s3", codes: ["OCEAN_FREIGHT", "DOC_FEE"], bill: -8, due: 22, status: "APPROVED" },
  { id: "vb-seed-02", vendorId: "v3", jobId: "s6", codes: ["THC"], bill: -3, due: 12, status: "DRAFT" },
  { id: "vb-seed-03", vendorId: "v5", jobId: "s17", codes: ["CUSTOMS"], bill: -4, due: 3, status: "APPROVED" },
  { id: "vb-seed-04", vendorId: "v4", jobId: "s11", codes: ["TRUCKING"], bill: -20, due: -5, status: "APPROVED" },
  { id: "vb-seed-05", vendorId: "v1", jobId: "s1", codes: ["OCEAN_FREIGHT", "DOC_FEE"], bill: -6, due: 24, status: "DRAFT" },
  { id: "vb-seed-06", vendorId: "v1", jobId: "s21", codes: ["OCEAN_FREIGHT", "DOC_FEE"], bill: -96, due: -66, status: "PAID" },
  { id: "vb-seed-07", vendorId: "v4", jobId: "s20", codes: ["TRUCKING"], bill: -66, due: -51, status: "PAID" },
  { id: "vb-seed-08", vendorId: "v3", jobId: "s19", codes: ["THC"], bill: -72, due: -57, status: "PAID" },
  { id: "vb-seed-09", vendorId: "v5", jobId: "s18", codes: ["CUSTOMS"], bill: -3, due: 4, status: "APPROVED" },
  { id: "vb-seed-10", vendorId: "v2", jobId: "s19", codes: ["OCEAN_FREIGHT", "DOC_FEE"], bill: -78, due: -48, status: "PARTIAL" },
  { id: "vb-seed-11", vendorId: "v4", jobId: "s22", codes: ["TRUCKING"], bill: -32, due: -17, status: "APPROVED" },
  { id: "vb-seed-12", vendorId: "v3", jobId: "s2", codes: ["THC"], bill: -2, due: 13, status: "DRAFT" },
];

/** International freight is zero-rated; local services carry 7% VAT. */
const taxCodeFor = (chargeCode: string) => (chargeCode === "OCEAN_FREIGHT" ? "VAT0" : "VAT7");

function inPart(c: DemoCharge, part: Part) {
  if (part === "all") return true;
  return part === "freight" ? c.chargeCode === "OCEAN_FREIGHT" : c.chargeCode !== "OCEAN_FREIGHT";
}

export async function seedFinance(db: Db, now = new Date()) {
  const at = (days: number, hour = 10) => new Date(`${bangkokDate(now, days)}T${String(hour).padStart(2, "0")}:00:00+07:00`);

  const demoJobs = new Map(demoJobsForSeed().map((j) => [j.id, j]));
  const present = new Set(
    (await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.id, [...demoJobs.keys()]))).map((r) => r.id),
  );
  const staff = new Map(
    (await db.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.email, u.id]),
  );
  const financeUser = staff.get("finance@cangzhan.com") ?? staff.get("admin@cangzhan.com") ?? null;
  const taxRates = new Map((await db.select().from(taxCodes)).map((t) => [t.code, t.rate]));
  if (!taxRates.has("VAT7")) taxRates.set("VAT7", "0.0700");
  if (!taxRates.has("VAT0")) taxRates.set("VAT0", "0.0000");

  const chargesOf = (jobId: string) => {
    const j = demoJobs.get(jobId)!;
    return demoJobCharges(j, j.containerCount);
  };

  async function keepNumber<T extends { id: string; n: string }>(rows: T[], id: string, kind: string) {
    return rows.find((r) => r.id === id)?.n ?? (await nextDocNumber(db, kind, kind));
  }

  // ── Invoices ──
  const invSpecs = INVOICES.filter((s) => present.has(s.jobId));
  const invExisting = await db
    .select({ id: invoices.id, n: invoices.invoiceNumber })
    .from(invoices)
    .where(inArray(invoices.id, invSpecs.map((s) => s.id)));

  // Paid amount per invoice, from the payment plan.
  const totals = new Map<string, { total: string; currency: string; customerId: string }>();
  const invoicedChargeIds: string[] = [];

  for (const spec of invSpecs) {
    const job = demoJobs.get(spec.jobId)!;
    const charges = chargesOf(spec.jobId).filter((c) => c.chargeType === "REVENUE" && inPart(c, spec.part));
    const computed = computeManualLines(
      charges.map((c) => ({ description: c.description, qty: c.quantity, unitPrice: c.unitAmount, taxCode: taxCodeFor(c.chargeCode) })),
      taxRates,
    );
    totals.set(spec.id, { total: computed.total, currency: job.currency, customerId: job.customerId });
    const invoiceNumber = await keepNumber(invExisting, spec.id, "INV");
    const issueDate = at(spec.issue, 9);
    const dueDate = at(spec.issue + spec.terms, 23);
    const paid = paidFor(spec.id, computed.total);
    const balance = sub(computed.total, paid);
    const values = {
      organizationId: DEMO_ORG_ID,
      invoiceNumber,
      customerId: job.customerId,
      jobId: job.id,
      issueDate,
      dueDate,
      currency: job.currency,
      exchangeRate: "1",
      subtotal: computed.subtotal,
      tax: computed.tax,
      total: computed.total,
      paidAmount: toDb(paid),
      balanceDue: toDb(balance.lt(0) ? d(0) : balance),
      paymentTermsDays: spec.terms,
      notes: spec.notes ?? null,
      status: spec.status,
      createdBy: financeUser,
      issuedBy: spec.status === "DRAFT" ? null : financeUser,
      issuedAt: spec.status === "DRAFT" ? null : issueDate,
      snapshot: JSON.stringify({ source: "SEED", chargeIds: charges.map((c) => c.id) }),
      updatedAt: now,
    };
    await db
      .insert(invoices)
      .values({ id: spec.id, ...values, createdAt: issueDate })
      .onConflictDoUpdate({ target: invoices.id, set: values });

    for (const [i, line] of computed.lines.entries()) {
      const c = charges[i]!;
      const row = {
        invoiceId: spec.id,
        chargeId: c.id,
        description: line.description,
        quantity: line.quantity,
        unitAmount: line.unitAmount,
        amount: line.amount,
        currency: job.currency,
        taxCode: line.taxCode,
      };
      await db.insert(invoiceLines).values({ id: `${spec.id}-l${i}`, ...row }).onConflictDoUpdate({ target: invoiceLines.id, set: row });
      invoicedChargeIds.push(c.id);
    }
  }
  if (invoicedChargeIds.length) {
    await db.update(shipmentCharges).set({ invoiced: true }).where(inArray(shipmentCharges.id, invoicedChargeIds));
  }

  function paidFor(invoiceId: string, total: string) {
    const shares = PAYMENTS.flatMap((p) => p.allocations.filter((a) => a.invoiceId === invoiceId));
    return shares.length ? add(...shares.map((a) => allocAmount(total, a.share))) : d(0);
  }

  // ── Payments + allocations ──
  const paySpecs = PAYMENTS.filter((p) => p.allocations.every((a) => totals.has(a.invoiceId)));
  const payExisting = await db
    .select({ id: payments.id, n: payments.paymentNumber })
    .from(payments)
    .where(inArray(payments.id, paySpecs.map((p) => p.id)));
  for (const p of paySpecs) {
    const first = totals.get(p.allocations[0]!.invoiceId)!;
    const allocs = p.allocations.map((a) => ({ ...a, amount: allocAmount(totals.get(a.invoiceId)!.total, a.share) }));
    const paymentNumber = await keepNumber(payExisting, p.id, "PAY");
    const values = {
      paymentNumber,
      customerId: first.customerId,
      paymentDate: at(p.day, 14),
      amount: toDb(add(...allocs.map((a) => a.amount))),
      currency: first.currency,
      method: p.method,
      reference: p.reference,
      bankReference: p.bankReference ?? null,
      status: "RECORDED",
    };
    await db.insert(payments).values({ id: p.id, ...values }).onConflictDoUpdate({ target: payments.id, set: values });
    for (const [i, a] of allocs.entries()) {
      const row = { paymentId: p.id, invoiceId: a.invoiceId, amount: toDb(a.amount) };
      await db
        .insert(paymentAllocations)
        .values({ id: `${p.id}-a${i}`, ...row })
        .onConflictDoUpdate({ target: paymentAllocations.id, set: row });
    }
  }

  // ── Billing notes (group open invoices per customer) ──
  const bnSpecs = BILLING_NOTES.filter((b) => b.invoiceIds.every((id) => totals.has(id)));
  const bnExisting = await db
    .select({ id: billingNotes.id, n: billingNotes.billingNumber })
    .from(billingNotes)
    .where(inArray(billingNotes.id, bnSpecs.map((b) => b.id)));
  for (const b of bnSpecs) {
    const rows = await db.select().from(invoices).where(inArray(invoices.id, b.invoiceIds));
    const sum = add(...rows.map((r) => r.balanceDue));
    const billingNumber = await keepNumber(bnExisting, b.id, "BN");
    const values = {
      billingNumber,
      customerId: b.customerId,
      billingDate: at(b.day, 10),
      scheduledPaymentDate: at(b.day + b.payIn, 10),
      currency: rows[0]!.currency,
      subtotal: toDb(sum),
      grandTotal: toDb(sum),
      status: "ISSUED",
      snapshot: JSON.stringify({ invoiceIds: b.invoiceIds, source: "SEED" }),
      updatedAt: now,
    };
    await db.insert(billingNotes).values({ id: b.id, ...values }).onConflictDoUpdate({ target: billingNotes.id, set: values });
    for (const [i, inv] of rows.entries()) {
      const row = { billingNoteId: b.id, invoiceId: inv.id, amount: inv.balanceDue };
      await db
        .insert(billingNoteItems)
        .values({ id: `${b.id}-i${i}`, ...row })
        .onConflictDoUpdate({ target: billingNoteItems.id, set: row });
    }
  }

  // ── Vendor bills ──
  const vbSpecs = VENDOR_BILLS.filter((b) => present.has(b.jobId));
  const vbExisting = await db
    .select({ id: vendorBills.id, n: vendorBills.billNumber })
    .from(vendorBills)
    .where(inArray(vendorBills.id, vbSpecs.map((b) => b.id)));
  const billedChargeIds: string[] = [];
  let billCount = 0;
  for (const b of vbSpecs) {
    const job = demoJobs.get(b.jobId)!;
    const charges = chargesOf(b.jobId).filter((c) => c.chargeType === "COST" && b.codes.includes(c.chargeCode) && c.vendorId === b.vendorId);
    if (!charges.length) continue;
    const computed = computeManualLines(
      charges.map((c) => ({ description: c.description, qty: c.quantity, unitPrice: c.unitAmount, taxCode: taxCodeFor(c.chargeCode) })),
      taxRates,
    );
    const billNumber = await keepNumber(vbExisting, b.id, "VB");
    const approved = b.status !== "DRAFT";
    const values = {
      organizationId: DEMO_ORG_ID,
      vendorId: b.vendorId,
      jobId: b.jobId,
      billNumber,
      billDate: at(b.bill, 11),
      dueDate: at(b.due, 23),
      currency: job.currency,
      subtotal: computed.subtotal,
      tax: computed.tax,
      total: computed.total,
      status: b.status,
      approvedBy: approved ? financeUser : null,
      approvedAt: approved ? at(b.bill + 1, 15) : null,
      updatedAt: now,
    };
    await db
      .insert(vendorBills)
      .values({ id: b.id, ...values, createdAt: at(b.bill, 11) })
      .onConflictDoUpdate({ target: vendorBills.id, set: values });
    for (const [i, line] of computed.lines.entries()) {
      const c = charges[i]!;
      const row = {
        vendorBillId: b.id,
        chargeId: c.id,
        description: line.description,
        quantity: line.quantity,
        unitAmount: line.unitAmount,
        taxCode: line.taxCode,
        amount: line.amount,
        currency: job.currency,
      };
      await db.insert(vendorBillLines).values({ id: `${b.id}-l${i}`, ...row }).onConflictDoUpdate({ target: vendorBillLines.id, set: row });
      billedChargeIds.push(c.id);
    }
    billCount++;
  }
  if (billedChargeIds.length) {
    await db.update(shipmentCharges).set({ billed: true }).where(inArray(shipmentCharges.id, billedChargeIds));
  }

  return { invoices: invSpecs.length, payments: paySpecs.length, billingNotes: bnSpecs.length, vendorBills: billCount };
}

/** Amount allocated to an invoice: full total, or a share rounded to 2 dp. */
function allocAmount(total: string, share: number) {
  return share >= 1 ? d(total) : d(total).times(share).toDecimalPlaces(2);
}
