import { inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { invoices } from "../db/schema/finance.js";
import { shipmentCharges } from "../db/schema/operations.js";
import { add, d, grossProfit, toDb } from "../lib/money.js";

export type JobBillingStatus = "UNBILLED" | "INVOICED" | "PARTIAL" | "PAID";

export type JobListEnrichment = {
  grossProfit: string | null;
  billingStatus: JobBillingStatus;
};

function deriveBillingStatus(
  jobInvs: Array<{ status: string; balanceDue: string; paidAmount: string }>,
): JobBillingStatus {
  if (!jobInvs.length) return "UNBILLED";
  const nonDraft = jobInvs.filter((i) => i.status !== "DRAFT");
  if (!nonDraft.length) return "UNBILLED";
  const allPaid = nonDraft.every((i) => i.status === "PAID" || d(i.balanceDue).lte(0));
  if (allPaid) return "PAID";
  const anyPaid = nonDraft.some((i) => d(i.paidAmount).gt(0));
  if (anyPaid) return "PARTIAL";
  return "INVOICED";
}

/** Batch GP + billing status for jobs list — no schema changes. */
export async function enrichJobsForList(db: Db, jobIds: string[]): Promise<Map<string, JobListEnrichment>> {
  const map = new Map<string, JobListEnrichment>();
  if (!jobIds.length) return map;

  const [charges, invRows] = await Promise.all([
    db.select().from(shipmentCharges).where(inArray(shipmentCharges.jobId, jobIds)),
    db.select().from(invoices).where(inArray(invoices.jobId, jobIds)),
  ]);

  for (const id of jobIds) {
    const jobCharges = charges.filter((c) => c.jobId === id);
    const revenue = jobCharges.filter((c) => c.chargeType === "REVENUE");
    const cost = jobCharges.filter((c) => c.chargeType === "COST");
    const totalRevenue = revenue.length ? add(...revenue.map((c) => c.actualAmount ?? c.totalAmount)) : d(0);
    const totalCost = cost.length ? add(...cost.map((c) => c.actualAmount ?? c.totalAmount)) : d(0);
    const gp = jobCharges.length ? toDb(grossProfit(totalRevenue, totalCost)) : null;
    const jobInvs = invRows.filter((i) => i.jobId === id);
    map.set(id, {
      grossProfit: gp,
      billingStatus: deriveBillingStatus(jobInvs),
    });
  }

  return map;
}
