import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { Db } from "./index.js";
import { opportunities } from "./schema/crm.js";
import { bookings, containers, jobs } from "./schema/operations.js";
import { nextDocNumber } from "../services/sequence.service.js";
import { bangkokDate, demoJobsForSeed } from "./seed-operations.js";
import { syncDocSequences } from "./seed-sequences.js";

/*
 * Round-3 demo data (idempotent, dates relative to today):
 *  - one carrier booking per demo job (bk-seed-<job>), linked to the job, with SI / VGM / CY cut-offs;
 *  - real free time (free days + last free day) on inbound demo containers;
 *  - deal currencies that match their quotations;
 *  - leads / deals mapped from the old owner names to staff users.
 * Runs after seed-operations + seed-sales. Rows created by users are never touched.
 */

const STAGE_OF: Record<string, string> = { BOOKING: "booking", GATE_IN: "gate_in", SAIL: "sail", ARRIVED: "arrived", DELIVERED: "delivered", CLOSED: "delivered" };

/** A Bangkok wall-clock time on the date `days` from the ETD. */
function aroundEtd(etd: string, days: number, hour: number) {
  const date = bangkokDate(new Date(`${etd}T12:00:00+07:00`), days);
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+07:00`);
}

/** Deals linked to a USD quotation carry that quote's value and currency. */
const DEAL_CURRENCY: Record<string, { currency: string; value: number }> = {
  d1: { currency: "USD", value: 8600 },
  d3: { currency: "USD", value: 4360 },
  d13: { currency: "USD", value: 14800 },
};

/** Free days per inbound demo container (by carrier contract), cycled for variety. */
const FREE_DAYS = [7, 5, 10, 7, 14];

export async function seedFields(db: Db, now = new Date()) {
  const demo = demoJobsForSeed();
  const jobRows = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.id, demo.map((j) => j.id)));

  // Keep booking numbers from earlier runs; new ones come after existing BK numbers.
  const bookingIds = jobRows.map((j) => `bk-seed-${j.id}`);
  const existing = bookingIds.length
    ? await db.select({ id: bookings.id, n: bookings.bookingNumber }).from(bookings).where(inArray(bookings.id, bookingIds))
    : [];
  const numberOf = new Map(existing.map((r) => [r.id, r.n]));
  let synced = false;

  let bookingCount = 0;
  for (const j of jobRows.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber))) {
    // A job the user already linked to another booking stays as it is.
    if (j.bookingId && j.bookingId !== `bk-seed-${j.id}`) continue;
    if (!j.etd) continue;
    const id = `bk-seed-${j.id}`;
    let bookingNumber = numberOf.get(id);
    if (!bookingNumber) {
      if (!synced) {
        await syncDocSequences(db);
        synced = true;
      }
      bookingNumber = await nextDocNumber(db, "BK", "BK");
    }
    const cut = {
      siCutoff: aroundEtd(j.etd, -3, 17),
      vgmCutoff: aroundEtd(j.etd, -2, 12),
      cyCutoff: aroundEtd(j.etd, -1, 12),
    };
    const values = {
      bookingNumber,
      carrierBookingNo: j.bookingNumber,
      customerId: j.customerId,
      quotationId: j.quotationId,
      origin: j.origin,
      destination: j.destination,
      pol: j.pol,
      pod: j.pod,
      mode: j.mode,
      carrier: j.carrier,
      containerType: j.containerType,
      quantity: Math.max(1, j.containerCount),
      commodity: j.commodity,
      vessel: j.vessel,
      voyage: j.voyage,
      bl: j.masterBl,
      etd: j.etd,
      eta: j.eta,
      teu: j.teu,
      stage: STAGE_OF[j.status] ?? "booking",
      status: "CONFIRMED",
      salesOwnerId: j.salesOwnerId,
      ...cut,
      updatedAt: now,
    };
    await db
      .insert(bookings)
      .values({ id, ...values })
      .onConflictDoUpdate({ target: bookings.id, set: values });
    await db.update(jobs).set({ bookingId: id, ...cut }).where(eq(jobs.id, j.id));
    bookingCount++;
  }

  // Free time on inbound demo containers: free days by contract, last free day = ETA + free days.
  const boxes = await db
    .select({ id: containers.id, eta: containers.eta })
    .from(containers)
    .where(and(eq(containers.direction, "in"), like(containers.id, "ctr-%"), inArray(containers.jobId, demo.map((j) => j.id))))
    .orderBy(containers.containerNo);
  let boxCount = 0;
  for (const [i, b] of boxes.entries()) {
    if (!b.eta) continue;
    const freeDays = FREE_DAYS[i % FREE_DAYS.length]!;
    const lastFreeDay = bangkokDate(new Date(`${String(b.eta)}T12:00:00+07:00`), freeDays);
    await db.update(containers).set({ freeDays, lastFreeDay }).where(eq(containers.id, b.id));
    boxCount++;
  }

  for (const [id, v] of Object.entries(DEAL_CURRENCY)) {
    await db.update(opportunities).set(v).where(eq(opportunities.id, id));
  }

  // Legacy owner names (any language) → staff users.
  await db.execute(sql`
    UPDATE leads l SET owner_user_id = u.id FROM users u
    WHERE l.owner_user_id IS NULL AND l.owner <> '' AND l.owner IN (u.name, u.name_zh, u.name_th)`);
  await db.execute(sql`
    UPDATE opportunities o SET owner_user_id = u.id FROM users u
    WHERE o.owner_user_id IS NULL AND o.owner <> '' AND o.owner IN (u.name, u.name_zh, u.name_th)`);

  return { bookings: bookingCount, containers: boxCount };
}
