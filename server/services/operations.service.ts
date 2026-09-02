import { desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { bookings, jobs, shipmentCharges } from "../db/schema/operations.js";

export async function listJobs(db: Db, customerId?: string) {
  return db
    .select()
    .from(jobs)
    .where(customerId ? eq(jobs.customerId, customerId) : undefined)
    .orderBy(desc(jobs.updatedAt));
}

export async function getJob(db: Db, id: string) {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ?? null;
}

export async function listJobCharges(db: Db, jobId: string) {
  return db.select().from(shipmentCharges).where(eq(shipmentCharges.jobId, jobId));
}

export async function listBookingsByQuotation(db: Db, quotationId: string) {
  return db.select().from(bookings).where(eq(bookings.quotationId, quotationId)).orderBy(desc(bookings.createdAt));
}

export async function updateChargeActual(db: Db, chargeId: string, actualAmount: string) {
  const [row] = await db
    .update(shipmentCharges)
    .set({ actualAmount, updatedAt: new Date() })
    .where(eq(shipmentCharges.id, chargeId))
    .returning();
  return row ?? null;
}
