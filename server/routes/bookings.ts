import { z } from "zod";
import { Hono } from "hono";
import { getDb, hasDatabase } from "../db/index.js";
import { authMiddleware, requireAuth, requirePermission, requireTenant, type AuthEnv } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.service.js";
import {
  BOOKING_STAGES,
  BOOKING_STATUSES,
  BookingInputError,
  createBooking,
  getBooking,
  linkJob,
  listBookings,
  unlinkJob,
  updateBooking,
  updateJobCutoffs,
} from "../services/booking.service.js";

function dbOr503(c: { json: (body: unknown, status?: number) => Response }) {
  if (!hasDatabase()) return c.json({ error: "database_unconfigured" }, 503);
  const db = getDb();
  if (!db) return c.json({ error: "database_unavailable" }, 503);
  return db;
}

const tenantGate = [requireAuth(), requireTenant()] as const;
const orgId = (c: { get: (k: "organizationId") => string | null }) => c.get("organizationId")!;

const text = (max = 120) => z.string().trim().max(max);
const optText = (max = 120) =>
  text(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));
const port = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .transform((v) => v.toUpperCase());
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "invalid_date");
const optDay = z
  .union([day, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));
const stamp = z
  .union([z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "invalid_datetime"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const fields = {
  carrierBookingNo: optText(40),
  origin: optText(),
  destination: optText(),
  mode: z.enum(["SEA_FCL", "SEA_LCL", "AIR", "TRUCK", "RAIL"]).optional(),
  carrier: optText(60),
  containerType: optText(12),
  quantity: z.number().int().min(1).max(999).optional(),
  commodity: optText(200),
  vessel: optText(80),
  voyage: optText(30),
  bl: optText(40),
  etd: optDay,
  eta: optDay,
  teu: z.number().int().min(0).max(9999).optional(),
  stage: z.enum(BOOKING_STAGES).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  siCutoff: stamp,
  cyCutoff: stamp,
  vgmCutoff: stamp,
};

const etaAfterEtd = (v: { etd?: string | null; eta?: string | null }) => !v.etd || !v.eta || v.eta >= v.etd;

const createSchema = z
  .object({
    customerId: z.string().min(1),
    quotationId: z.string().min(1).nullable().optional(),
    pol: port,
    pod: port,
    jobIds: z.array(z.string().min(1)).max(20).optional(),
    ...fields,
  })
  .refine(etaAfterEtd, { path: ["eta"], message: "eta_before_etd" });

const patchSchema = z
  .object({ pol: port.optional(), pod: port.optional(), ...fields })
  .refine(etaAfterEtd, { path: ["eta"], message: "eta_before_etd" });

const cutoffSchema = z.object({ siCutoff: stamp, cyCutoff: stamp, vgmCutoff: stamp });

async function parseBody<T extends z.ZodType>(c: { req: { json: () => Promise<unknown> }; json: (b: unknown, s?: number) => Response }, schema: T) {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: c.json({ error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400) };
  }
  return { data: parsed.data as z.infer<T> };
}

function inputError(c: { json: (b: unknown, s?: number) => Response }, e: unknown) {
  if (e instanceof BookingInputError) {
    if (e.status === 404) return c.json({ error: e.code }, 404);
    return c.json({ error: "invalid_body", issues: [{ path: e.field ?? "", message: e.code }] }, 400);
  }
  throw e;
}

export function bookingRoutes() {
  const r = new Hono<AuthEnv>();
  r.use("*", authMiddleware);

  r.get("/bookings", ...tenantGate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const items = await listBookings(db, orgId(c), {
      customerId: c.req.query("customerId") || undefined,
      jobId: c.req.query("jobId") || undefined,
      stage: c.req.query("stage") || undefined,
    });
    return c.json({ items });
  });

  r.get("/bookings/:id", ...tenantGate, requirePermission("shipment.view"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const b = await getBooking(db, orgId(c), c.req.param("id"));
    if (!b) return c.json({ error: "not_found" }, 404);
    return c.json(b);
  });

  r.post("/bookings", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = await parseBody(c, createSchema);
    if (body.error) return body.error;
    try {
      const b = await createBooking(db, orgId(c), body.data);
      await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "BOOKING_CREATED", entityType: "booking", entityId: b.id, newValue: b });
      return c.json(b, 201);
    } catch (e) {
      return inputError(c, e);
    }
  });

  r.patch("/bookings/:id", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = await parseBody(c, patchSchema);
    if (body.error) return body.error;
    const res = await updateBooking(db, orgId(c), c.req.param("id"), body.data);
    if (!res) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "BOOKING_UPDATED", entityType: "booking", entityId: res.after.id, oldValue: res.before, newValue: body.data });
    return c.json(res.after);
  });

  r.post("/bookings/:id/jobs", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = await parseBody(c, z.object({ jobId: z.string().min(1) }));
    if (body.error) return body.error;
    try {
      const b = await linkJob(db, orgId(c), c.req.param("id"), body.data.jobId);
      if (!b) return c.json({ error: "not_found" }, 404);
      await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "BOOKING_JOB_LINKED", entityType: "booking", entityId: b.id, newValue: { jobId: body.data.jobId } });
      return c.json(b);
    } catch (e) {
      return inputError(c, e);
    }
  });

  r.delete("/bookings/:id/jobs/:jobId", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    try {
      const b = await unlinkJob(db, orgId(c), c.req.param("id"), c.req.param("jobId"));
      if (!b) return c.json({ error: "not_found" }, 404);
      await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "BOOKING_JOB_UNLINKED", entityType: "booking", entityId: b.id, oldValue: { jobId: c.req.param("jobId") } });
      return c.json(b);
    } catch (e) {
      return inputError(c, e);
    }
  });

  /** SI / CY / VGM cut-offs on a job (bookings copy theirs to linked jobs automatically). */
  r.patch("/jobs/:id/cutoffs", ...tenantGate, requirePermission("shipment.edit"), async (c) => {
    const db = dbOr503(c);
    if (typeof db !== "object" || !("select" in db)) return db;
    const body = await parseBody(c, cutoffSchema);
    if (body.error) return body.error;
    const row = await updateJobCutoffs(db, orgId(c), c.req.param("id"), body.data);
    if (!row) return c.json({ error: "not_found" }, 404);
    await writeAudit(db, { userId: c.get("user")!.id, organizationId: orgId(c), action: "JOB_CUTOFFS_UPDATED", entityType: "job", entityId: row.id, newValue: row });
    return c.json(row);
  });

  return r;
}
