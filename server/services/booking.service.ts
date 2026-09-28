import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customers } from "../db/schema/crm.js";
import { bookings, containers, jobs } from "../db/schema/operations.js";
import { nextDocNumber } from "./sequence.service.js";

/*
 * Bookings (space booked with a carrier). Tenant scope comes from the booking's customer.
 * A booking can feed one or more jobs (jobs.booking_id); cut-offs set on a booking are
 * copied to its jobs so the job file shows the same deadlines.
 */

export const BOOKING_STAGES = ["booking", "gate_in", "sail", "arrived", "delivered"] as const;
export type BookingStage = (typeof BOOKING_STAGES)[number];
export const BOOKING_STATUSES = ["DRAFT", "CONFIRMED", "CANCELLED"] as const;

export class BookingInputError extends Error {
  code: string;
  field?: string;
  status: 400 | 404;
  constructor(code: string, field?: string, status: 400 | 404 = 400) {
    super(code);
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

export type BookingJobRef = { id: string; jobNumber: string; status: string };
export type BookingBoxRef = { id: string; containerNo: string; type: string; status: string };

export type BookingDto = {
  id: string;
  bookingNumber: string;
  carrierBookingNo: string | null;
  customerId: string;
  quotationId: string | null;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  carrier: string | null;
  containerType: string | null;
  quantity: number;
  commodity: string | null;
  vessel: string | null;
  voyage: string | null;
  bl: string | null;
  etd: string | null;
  eta: string | null;
  teu: number;
  stage: BookingStage;
  status: string;
  siCutoff: string | null;
  cyCutoff: string | null;
  vgmCutoff: string | null;
  jobs: BookingJobRef[];
  containers: BookingBoxRef[];
  createdAt: string;
  updatedAt: string;
};

type BookingRow = typeof bookings.$inferSelect;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function teuOf(b: BookingRow) {
  if (b.teu > 0) return b.teu;
  return b.quantity * (/^20/.test(b.containerType ?? "") ? 1 : 2);
}

function toDto(b: BookingRow, linked: BookingJobRef[], boxes: BookingBoxRef[]): BookingDto {
  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    carrierBookingNo: b.carrierBookingNo,
    customerId: b.customerId,
    quotationId: b.quotationId,
    origin: b.origin,
    destination: b.destination,
    pol: b.pol,
    pod: b.pod,
    mode: b.mode,
    carrier: b.carrier,
    containerType: b.containerType,
    quantity: b.quantity,
    commodity: b.commodity,
    vessel: b.vessel,
    voyage: b.voyage,
    bl: b.bl,
    etd: b.etd ? String(b.etd) : null,
    eta: b.eta ? String(b.eta) : null,
    teu: teuOf(b),
    stage: (BOOKING_STAGES as readonly string[]).includes(b.stage) ? (b.stage as BookingStage) : "booking",
    status: b.status,
    siCutoff: iso(b.siCutoff),
    cyCutoff: iso(b.cyCutoff),
    vgmCutoff: iso(b.vgmCutoff),
    jobs: linked,
    containers: boxes,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

/** Linked jobs + containers (by job or by B/L) for a set of bookings. */
async function enrich(db: Db, organizationId: string, rows: BookingRow[]): Promise<BookingDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((b) => b.id);
  const jobRows = await db
    .select({ id: jobs.id, jobNumber: jobs.jobNumber, status: jobs.status, bookingId: jobs.bookingId })
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), inArray(jobs.bookingId, ids)))
    .orderBy(jobs.jobNumber);
  const jobIds = jobRows.map((j) => j.id);
  const bls = rows.map((b) => b.bl).filter((v): v is string => Boolean(v));
  const boxClauses = [];
  if (jobIds.length) boxClauses.push(inArray(containers.jobId, jobIds));
  if (bls.length) boxClauses.push(inArray(containers.bl, bls));
  const boxRows = boxClauses.length
    ? await db
        .select({ id: containers.id, containerNo: containers.containerNo, type: containers.type, status: containers.status, jobId: containers.jobId, bl: containers.bl })
        .from(containers)
        .where(and(eq(containers.organizationId, organizationId), or(...boxClauses)))
        .orderBy(containers.containerNo)
    : [];
  return rows.map((b) => {
    const linked = jobRows.filter((j) => j.bookingId === b.id);
    const mine = new Set(linked.map((j) => j.id));
    const boxes = boxRows.filter((c) => (c.jobId && mine.has(c.jobId)) || (b.bl && c.bl === b.bl));
    return toDto(
      b,
      linked.map(({ id, jobNumber, status }) => ({ id, jobNumber, status })),
      boxes.map(({ id, containerNo, type, status }) => ({ id, containerNo, type, status })),
    );
  });
}

export async function listBookings(
  db: Db,
  organizationId: string,
  filters: { customerId?: string; jobId?: string; stage?: string } = {},
): Promise<BookingDto[]> {
  const clauses = [eq(customers.organizationId, organizationId)];
  if (filters.customerId) clauses.push(eq(bookings.customerId, filters.customerId));
  if (filters.stage) clauses.push(eq(bookings.stage, filters.stage));
  if (filters.jobId) {
    const [j] = await db
      .select({ bookingId: jobs.bookingId })
      .from(jobs)
      .where(and(eq(jobs.id, filters.jobId), eq(jobs.organizationId, organizationId)))
      .limit(1);
    if (!j?.bookingId) return [];
    clauses.push(eq(bookings.id, j.bookingId));
  }
  const rows = await db
    .select({ b: bookings })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(and(...clauses))
    .orderBy(desc(bookings.updatedAt));
  return enrich(
    db,
    organizationId,
    rows.map((r) => r.b),
  );
}

async function findRow(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select({ b: bookings })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(and(eq(bookings.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  return row?.b ?? null;
}

export async function getBooking(db: Db, organizationId: string, id: string) {
  const row = await findRow(db, organizationId, id);
  if (!row) return null;
  const [dto] = await enrich(db, organizationId, [row]);
  return dto ?? null;
}

export type BookingInput = {
  customerId: string;
  carrierBookingNo?: string | null;
  quotationId?: string | null;
  origin?: string | null;
  destination?: string | null;
  pol: string;
  pod: string;
  mode?: string;
  carrier?: string | null;
  containerType?: string | null;
  quantity?: number;
  commodity?: string | null;
  vessel?: string | null;
  voyage?: string | null;
  bl?: string | null;
  etd?: string | null;
  eta?: string | null;
  teu?: number;
  stage?: BookingStage;
  status?: (typeof BOOKING_STATUSES)[number];
  siCutoff?: string | null;
  cyCutoff?: string | null;
  vgmCutoff?: string | null;
  /** Jobs to link on create. */
  jobIds?: string[];
};

export type BookingPatch = Partial<Omit<BookingInput, "customerId" | "jobIds" | "quotationId">>;

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);

/** Jobs in this org for the booking's customer, or a typed error. */
async function jobsToLink(db: Db, organizationId: string, customerId: string, jobIds: string[]) {
  if (!jobIds.length) return [];
  const rows = await db
    .select({ id: jobs.id, customerId: jobs.customerId })
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), inArray(jobs.id, jobIds)));
  if (rows.length !== new Set(jobIds).size) throw new BookingInputError("job_not_found", "jobIds", 404);
  if (rows.some((j) => j.customerId !== customerId)) throw new BookingInputError("job_customer_mismatch", "jobIds");
  return rows.map((r) => r.id);
}

/** Copy the booking's cut-offs to its jobs. */
async function syncJobCutoffs(db: Db, organizationId: string, b: BookingRow) {
  await db
    .update(jobs)
    .set({ siCutoff: b.siCutoff, cyCutoff: b.cyCutoff, vgmCutoff: b.vgmCutoff, updatedAt: new Date() })
    .where(and(eq(jobs.bookingId, b.id), eq(jobs.organizationId, organizationId)));
}

export async function createBooking(db: Db, organizationId: string, input: BookingInput) {
  const [cust] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, input.customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!cust) throw new BookingInputError("customer_not_found", "customerId", 404);
  const link = await jobsToLink(db, organizationId, input.customerId, input.jobIds ?? []);

  const bookingNumber = await nextDocNumber(db, "BK", "BK");
  const id = `bk${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const quantity = input.quantity ?? 1;
  const [row] = await db
    .insert(bookings)
    .values({
      id,
      bookingNumber,
      carrierBookingNo: input.carrierBookingNo ?? null,
      customerId: input.customerId,
      quotationId: input.quotationId ?? null,
      origin: input.origin || input.pol,
      destination: input.destination || input.pod,
      pol: input.pol,
      pod: input.pod,
      mode: input.mode ?? "SEA_FCL",
      carrier: input.carrier ?? null,
      containerType: input.containerType ?? null,
      quantity,
      commodity: input.commodity ?? null,
      vessel: input.vessel ?? null,
      voyage: input.voyage ?? null,
      bl: input.bl ?? null,
      etd: input.etd ?? null,
      eta: input.eta ?? null,
      teu: input.teu ?? 0,
      stage: input.stage ?? "booking",
      status: input.status ?? "CONFIRMED",
      siCutoff: toDate(input.siCutoff) ?? null,
      cyCutoff: toDate(input.cyCutoff) ?? null,
      vgmCutoff: toDate(input.vgmCutoff) ?? null,
    })
    .returning();
  if (link.length) {
    await db
      .update(jobs)
      .set({ bookingId: id, bookingNumber: input.carrierBookingNo || bookingNumber, updatedAt: new Date() })
      .where(and(eq(jobs.organizationId, organizationId), inArray(jobs.id, link)));
    await syncJobCutoffs(db, organizationId, row);
  }
  return (await getBooking(db, organizationId, id))!;
}

export async function updateBooking(db: Db, organizationId: string, id: string, patch: BookingPatch) {
  const existing = await findRow(db, organizationId, id);
  if (!existing) return null;
  const set: Partial<typeof bookings.$inferInsert> = { updatedAt: new Date() };
  const copy = ["carrierBookingNo", "origin", "destination", "pol", "pod", "mode", "carrier", "containerType", "quantity", "commodity", "vessel", "voyage", "bl", "etd", "eta", "teu", "stage", "status"] as const;
  for (const k of copy) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  const cutoffChanged = patch.siCutoff !== undefined || patch.cyCutoff !== undefined || patch.vgmCutoff !== undefined;
  if (patch.siCutoff !== undefined) set.siCutoff = toDate(patch.siCutoff);
  if (patch.cyCutoff !== undefined) set.cyCutoff = toDate(patch.cyCutoff);
  if (patch.vgmCutoff !== undefined) set.vgmCutoff = toDate(patch.vgmCutoff);
  const [row] = await db.update(bookings).set(set).where(eq(bookings.id, id)).returning();
  if (cutoffChanged) await syncJobCutoffs(db, organizationId, row);
  return { before: existing, after: (await getBooking(db, organizationId, id))! };
}

export async function linkJob(db: Db, organizationId: string, bookingId: string, jobId: string) {
  const b = await findRow(db, organizationId, bookingId);
  if (!b) return null;
  await jobsToLink(db, organizationId, b.customerId, [jobId]);
  await db
    .update(jobs)
    .set({ bookingId: b.id, bookingNumber: b.carrierBookingNo || b.bookingNumber, siCutoff: b.siCutoff, cyCutoff: b.cyCutoff, vgmCutoff: b.vgmCutoff, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)));
  return getBooking(db, organizationId, bookingId);
}

export async function unlinkJob(db: Db, organizationId: string, bookingId: string, jobId: string) {
  const b = await findRow(db, organizationId, bookingId);
  if (!b) return null;
  const [j] = await db
    .update(jobs)
    .set({ bookingId: null, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.bookingId, bookingId), eq(jobs.organizationId, organizationId)))
    .returning({ id: jobs.id });
  if (!j) throw new BookingInputError("job_not_found", "jobId", 404);
  return getBooking(db, organizationId, bookingId);
}

export type JobCutoffs = { siCutoff?: string | null; cyCutoff?: string | null; vgmCutoff?: string | null };

export async function updateJobCutoffs(db: Db, organizationId: string, jobId: string, patch: JobCutoffs) {
  const set: Partial<typeof jobs.$inferInsert> = { updatedAt: new Date() };
  if (patch.siCutoff !== undefined) set.siCutoff = toDate(patch.siCutoff);
  if (patch.cyCutoff !== undefined) set.cyCutoff = toDate(patch.cyCutoff);
  if (patch.vgmCutoff !== undefined) set.vgmCutoff = toDate(patch.vgmCutoff);
  const [row] = await db
    .update(jobs)
    .set(set)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)))
    .returning({ id: jobs.id, siCutoff: jobs.siCutoff, cyCutoff: jobs.cyCutoff, vgmCutoff: jobs.vgmCutoff });
  if (!row) return null;
  return { id: row.id, siCutoff: iso(row.siCutoff), cyCutoff: iso(row.cyCutoff), vgmCutoff: iso(row.vgmCutoff) };
}
