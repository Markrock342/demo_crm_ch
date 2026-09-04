import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { bookings, jobs, shipmentCharges } from "../db/schema/operations.js";

export async function listJobs(
  db: Db,
  organizationId: string,
  customerId?: string,
  milestoneFilter?: "all" | "at_risk" | "pending",
) {
  const filters = [eq(jobs.organizationId, organizationId)];
  if (customerId) filters.push(eq(jobs.customerId, customerId));

  let rows = await db
    .select()
    .from(jobs)
    .where(and(...filters))
    .orderBy(desc(jobs.updatedAt));

  if (milestoneFilter && milestoneFilter !== "all") {
    const { filterJobsByMilestone } = await import("./milestone.service.js");
    const allowed = new Set(await filterJobsByMilestone(db, rows.map((r) => r.id), milestoneFilter));
    rows = rows.filter((r) => allowed.has(r.id));
  }
  return rows;
}

export async function getJob(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listJobCharges(db: Db, organizationId: string, jobId: string) {
  const job = await getJob(db, organizationId, jobId);
  if (!job) return [];
  return db.select().from(shipmentCharges).where(eq(shipmentCharges.jobId, jobId));
}

export async function listBookingsByQuotation(db: Db, organizationId: string, quotationId: string) {
  const { quotations } = await import("../db/schema/commercial.js");
  const [q] = await db
    .select({ id: quotations.id })
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)))
    .limit(1);
  if (!q) return [];
  return db.select().from(bookings).where(eq(bookings.quotationId, quotationId)).orderBy(desc(bookings.createdAt));
}

export async function updateChargeActual(db: Db, organizationId: string, jobId: string, chargeId: string, actualAmount: string) {
  const job = await getJob(db, organizationId, jobId);
  if (!job) return null;
  const [row] = await db
    .update(shipmentCharges)
    .set({ actualAmount, updatedAt: new Date() })
    .where(and(eq(shipmentCharges.id, chargeId), eq(shipmentCharges.jobId, jobId)))
    .returning();
  return row ?? null;
}
