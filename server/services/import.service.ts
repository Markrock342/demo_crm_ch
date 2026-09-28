/**
 * Bulk import from Excel / CSV (rows are parsed in the browser and sent keyed by field).
 * One request = one batch = one database transaction. Each row runs in its own savepoint so a
 * bad row is reported without losing the others. `dryRun` runs the same code and rolls back,
 * which is how the preview finds duplicates, unknown customers and database errors.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { contacts, customers } from "../db/schema/crm.js";
import { rateCharges, rateLanes, rateSheets, vendors } from "../db/schema/commercial.js";
import { jobs } from "../db/schema/operations.js";
import { users } from "../db/schema/auth.js";
import { importBatches, type ImportedItem } from "../db/schema/imports.js";
import { customerCreateSchema } from "../domain/customer.js";
import {
  IMPORT_UNDO_HOURS,
  nameKey,
  teuPerBox,
  validateRow,
  type ImportEntity,
  type Issue,
} from "../../src/lib/importer.js";
import { normalizeTaxId } from "../../src/lib/customerProfile.js";
import { createContact, createCustomer } from "./crm.service.js";
import { createVendor } from "./rate.service.js";
import { nextDocNumber } from "./sequence.service.js";
import { ensureJobMilestones } from "./milestone.service.js";
import { writeAudit } from "./audit.service.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type ImportRowIn = { row: number; data: Record<string, unknown> };
export type RowStatus = "ready" | "created" | "duplicate" | "error";
export type ImportRowResult = {
  row: number;
  status: RowStatus;
  /** Id of the created (or, for duplicates, the existing) record. */
  id?: string;
  /** What it matched / created, for the preview ("บริษัท ก", "JOB-2026-000031"). */
  label?: string;
  errors: Issue[];
  warnings: Issue[];
};
export type ImportResult = {
  batchId: string | null;
  dryRun: boolean;
  results: ImportRowResult[];
  summary: { total: number; created: number; ready: number; duplicate: number; error: number };
};

class Rollback extends Error {}

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/* ── Look-ups ─────────────────────────────────────────────────── */

type CustomerIndex = {
  byName: Map<string, Set<string>>;
  byTax: Map<string, Set<string>>;
  ids: Set<string>;
  label: Map<string, string>;
};

async function customerIndex(db: Db | Tx, organizationId: string): Promise<CustomerIndex> {
  const rows = await db
    .select({ id: customers.id, nameTh: customers.nameTh, nameEn: customers.nameEn, nameZh: customers.nameZh, taxId: customers.taxId, branchNo: customers.branchNo })
    .from(customers)
    .where(eq(customers.organizationId, organizationId));
  const idx: CustomerIndex = { byName: new Map(), byTax: new Map(), ids: new Set(), label: new Map() };
  for (const r of rows) addCustomer(idx, r.id, [r.nameTh, r.nameEn, r.nameZh], r.taxId, r.nameTh || r.nameEn);
  return idx;
}

function addCustomer(idx: CustomerIndex, id: string, names: (string | null | undefined)[], taxId: string | null | undefined, label: string) {
  idx.ids.add(id);
  idx.label.set(id, label);
  for (const n of names) {
    const k = nameKey(n);
    if (!k) continue;
    if (!idx.byName.has(k)) idx.byName.set(k, new Set());
    idx.byName.get(k)!.add(id);
  }
  const t = normalizeTaxId(taxId);
  if (t) {
    if (!idx.byTax.has(t)) idx.byTax.set(t, new Set());
    idx.byTax.get(t)!.add(id);
  }
}

/** Customer cell → id: an id, a tax ID, or a company name in any language. */
function matchCustomer(idx: CustomerIndex, raw: unknown): { id?: string; error?: string } {
  const s = String(raw ?? "").trim();
  if (idx.ids.has(s)) return { id: s };
  const tax = normalizeTaxId(s);
  const hits = /^\d{10,13}$/.test(tax) ? idx.byTax.get(tax) : idx.byName.get(nameKey(s));
  if (!hits || hits.size === 0) return { error: "customer_not_found" };
  if (hits.size > 1) return { error: "customer_ambiguous" };
  return { id: [...hits][0] };
}

/* ── Per-entity row writers ───────────────────────────────────── */

type Ctx = {
  tx: Tx;
  organizationId: string;
  userId: string;
  items: ImportedItem[];
  customers?: CustomerIndex;
  seen: Set<string>;
  existing: Map<string, string>;
  vendors?: Map<string, string>;
};

type RowOutcome = { status: "created" | "duplicate"; id: string; label: string; warnings?: Issue[] } | { status: "error"; errors: Issue[] };

async function importCustomer(ctx: Ctx, v: Record<string, unknown>): Promise<RowOutcome> {
  const idx = ctx.customers!;
  const taxKey = v.taxId ? `${v.taxId}|${v.branchNo ?? ""}` : null;
  const names = [v.nameTh, v.nameEn, v.nameZh].map(nameKey).filter(Boolean);
  const inFile = (taxKey && ctx.seen.has(`tax:${taxKey}`)) || names.some((n) => ctx.seen.has(`name:${n}`));
  if (inFile) return { status: "error", errors: [{ field: "nameTh", code: "duplicate_in_file" }] };
  const dupId = (taxKey && ctx.existing.get(`tax:${taxKey}`)) || names.map((n) => idx.byName.get(n)).find((s) => s && s.size)?.values().next().value;
  if (dupId) return { status: "duplicate", id: dupId, label: idx.label.get(dupId) ?? "" };

  const body: Record<string, unknown> = {};
  for (const k of ["nameTh", "nameEn", "nameZh", "taxId", "branchNo", "country", "city", "billingAddress", "billingEmail", "currency", "creditTermDays", "creditLimit", "paymentMethod", "businessType", "industry", "website", "leadSource", "status", "incoterms", "notes"]) {
    if (v[k] !== null && v[k] !== undefined) body[k] = v[k];
  }
  if ((v.containerTypes as string[])?.length) body.containerTypes = v.containerTypes;
  if ((v.commodities as string[])?.length) body.commodities = v.commodities;
  if (v.pol && v.pod) body.preferredLanes = [{ pol: v.pol, pod: v.pod }];
  const warnings: Issue[] = [];
  if (v.contactName) {
    body.contacts = [{ name: v.contactName, phone: v.contactPhone ?? null, email: v.contactEmail ?? null, lineId: v.contactLine ?? null, primary: true }];
  } else if (v.contactPhone || v.contactEmail || v.contactLine) {
    warnings.push({ field: "contactName", code: "contact_skipped" });
  }
  const parsed = customerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return { status: "error", errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "nameTh").replace(/^name$/, "nameTh"), code: i.message })) };
  }
  const id = uid("c");
  const row = await createCustomer(ctx.tx as unknown as Db, ctx.organizationId, { ...parsed.data, id });
  ctx.items.push({ type: "customer", id });
  if (taxKey) ctx.seen.add(`tax:${taxKey}`);
  for (const n of names) ctx.seen.add(`name:${n}`);
  return { status: "created", id, label: row.nameTh || row.nameEn, warnings };
}

async function importContact(ctx: Ctx, v: Record<string, unknown>): Promise<RowOutcome> {
  const m = matchCustomer(ctx.customers!, v.customer);
  if (!m.id) return { status: "error", errors: [{ field: "customer", code: m.error! }] };
  const keys = [`n:${m.id}|${nameKey(v.name)}`, ...(v.email ? [`e:${m.id}|${v.email}`] : [])];
  const dup = keys.map((k) => ctx.existing.get(k)).find(Boolean);
  const label = `${v.name} · ${ctx.customers!.label.get(m.id) ?? ""}`;
  if (dup) return { status: "duplicate", id: dup, label };
  if (keys.some((k) => ctx.seen.has(k))) return { status: "error", errors: [{ field: "name", code: "duplicate_in_file" }] };
  const id = uid("p");
  await createContact(ctx.tx as unknown as Db, {
    id,
    customerId: m.id,
    name: String(v.name),
    title: (v.title as string) ?? "",
    email: (v.email as string) ?? "",
    phone: (v.phone as string) ?? "",
    wechat: (v.wechat as string) ?? "",
    lineId: (v.lineId as string) ?? "",
    primary: v.primary === true,
  });
  ctx.items.push({ type: "contact", id });
  keys.forEach((k) => ctx.seen.add(k));
  return { status: "created", id, label };
}

const dayStart = (d: string) => new Date(`${d}T00:00:00+07:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59+07:00`);

async function importRate(ctx: Ctx, v: Record<string, unknown>): Promise<RowOutcome> {
  const warnings: Issue[] = [];
  const vKey = nameKey(v.vendor);
  let vendorId = ctx.vendors!.get(vKey);
  if (!vendorId) {
    const created = await createVendor(ctx.tx as unknown as Db, ctx.organizationId, {
      company: String(v.vendor),
      vendorType: "SHIPPING_LINE",
      currency: (v.currency as string) ?? "USD",
    });
    vendorId = created.id;
    ctx.vendors!.set(vKey, vendorId);
    ctx.items.push({ type: "vendor", id: vendorId });
    warnings.push({ field: "vendor", code: "new_vendor" });
  }
  const key = [vendorId, v.pol, v.pod, v.containerType ?? "", v.validFrom, v.validUntil].join("|");
  const label = `${v.pol} → ${v.pod}${v.containerType ? ` · ${v.containerType}` : ""}`;
  const dup = ctx.existing.get(key);
  if (dup) return { status: "duplicate", id: dup, label };
  if (ctx.seen.has(key)) return { status: "error", errors: [{ field: "pol", code: "duplicate_in_file" }] };

  const sheetId = uid("rs");
  const laneId = uid("rl");
  const currency = String(v.currency ?? "USD");
  await ctx.tx.insert(rateSheets).values({
    id: sheetId,
    vendorId,
    name: (v.sheetName as string) || `${(v.carrier as string) || String(v.vendor)} ${v.pol}-${v.pod}`,
    carrier: (v.carrier as string) ?? null,
    validFrom: dayStart(String(v.validFrom)),
    validUntil: dayEnd(String(v.validUntil)),
    currency,
    notes: (v.notes as string) ?? null,
  });
  await ctx.tx.insert(rateLanes).values({
    id: laneId,
    rateSheetId: sheetId,
    origin: (v.origin as string) || String(v.pol),
    destination: (v.destination as string) || String(v.pod),
    pol: String(v.pol),
    pod: String(v.pod),
    mode: String(v.mode ?? "SEA_FCL"),
    containerType: (v.containerType as string) ?? null,
  });
  const unit = v.mode === "SEA_LCL" ? "PER_CBM" : v.mode === "AIR" ? "PER_KG" : "PER_CONTAINER";
  for (const [side, price] of [
    ["BUY", v.buyPrice],
    ["SELL", v.sellPrice],
  ] as const) {
    if (price === null || price === undefined) continue;
    await ctx.tx.insert(rateCharges).values({
      id: uid("rc"),
      rateLaneId: laneId,
      chargeCode: "OCEAN_FREIGHT",
      description: v.mode === "AIR" ? "Air freight" : "Ocean freight",
      side,
      unit,
      quantity: "1",
      unitPrice: String(price),
      currency,
    });
  }
  ctx.items.push({ type: "rate_sheet", id: sheetId });
  ctx.seen.add(key);
  return { status: "created", id: laneId, label, warnings };
}

async function importJob(ctx: Ctx, v: Record<string, unknown>): Promise<RowOutcome> {
  const m = matchCustomer(ctx.customers!, v.customer);
  if (!m.id) return { status: "error", errors: [{ field: "customer", code: m.error! }] };
  const given = (v.jobNumber as string | null)?.trim() || null;
  const bkg = (v.bookingNumber as string | null)?.trim() || null;
  // Same customer, lane, ETD and vessel = the same shipment even without a job / booking number.
  const trip = v.etd ? `trip:${m.id}|${v.pol}|${v.pod}|${v.etd}|${nameKey(v.vessel)}` : null;
  const dup = (given && ctx.existing.get(`job:${given}`)) || (bkg && ctx.existing.get(`bkg:${bkg}`)) || (trip && ctx.existing.get(trip));
  if (dup) return { status: "duplicate", id: dup, label: given ?? bkg ?? "" };
  if (given && ctx.existing.has(`other:${given}`)) return { status: "error", errors: [{ field: "jobNumber", code: "job_number_taken" }] };
  if ((given && ctx.seen.has(`job:${given}`)) || (bkg && ctx.seen.has(`bkg:${bkg}`)) || (trip && ctx.seen.has(trip))) {
    return { status: "error", errors: [{ field: given ? "jobNumber" : "bookingNumber", code: "duplicate_in_file" }] };
  }
  const jobNumber = given ?? (await nextDocNumber(ctx.tx as unknown as Db, "JOB", "JOB"));
  const id = uid("job");
  const count = (v.containerCount as number | null) ?? 0;
  await ctx.tx.insert(jobs).values({
    id,
    organizationId: ctx.organizationId,
    jobNumber,
    customerId: m.id,
    direction: String(v.direction ?? "IMPORT"),
    mode: String(v.mode ?? "SEA_FCL"),
    incoterm: (v.incoterm as string) ?? null,
    origin: (v.origin as string) || String(v.pol),
    destination: (v.destination as string) || String(v.pod),
    pol: String(v.pol),
    pod: String(v.pod),
    carrier: (v.carrier as string) ?? null,
    bookingNumber: bkg,
    masterBl: (v.masterBl as string) ?? null,
    houseBl: (v.houseBl as string) ?? null,
    vessel: (v.vessel as string) ?? null,
    voyage: (v.voyage as string) ?? null,
    etd: (v.etd as string) ?? null,
    eta: (v.eta as string) ?? null,
    commodity: (v.commodity as string) ?? null,
    containerType: (v.containerType as string) ?? null,
    containerCount: count,
    teu: count * teuPerBox(v.containerType as string | null),
    salesOwnerId: ctx.userId,
    status: String(v.status ?? "BOOKING"),
  });
  await ensureJobMilestones(ctx.tx as unknown as Db, id);
  ctx.items.push({ type: "job", id });
  ctx.seen.add(`job:${jobNumber}`);
  if (bkg) ctx.seen.add(`bkg:${bkg}`);
  if (trip) ctx.seen.add(trip);
  return { status: "created", id, label: jobNumber };
}

/** Existing keys used for duplicate detection. */
async function existingKeys(tx: Tx, entity: ImportEntity, organizationId: string, rows: ImportRowIn[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (entity === "customers") {
    const list = await tx
      .select({ id: customers.id, taxId: customers.taxId, branchNo: customers.branchNo })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), sql`${customers.taxId} is not null`));
    for (const r of list) if (r.taxId) map.set(`tax:${r.taxId}|${r.branchNo ?? ""}`, r.id);
  }
  if (entity === "contacts") {
    const list = await tx
      .select({ id: contacts.id, customerId: contacts.customerId, name: contacts.name, email: contacts.email })
      .from(contacts)
      .innerJoin(customers, eq(contacts.customerId, customers.id))
      .where(eq(customers.organizationId, organizationId));
    for (const r of list) {
      map.set(`n:${r.customerId}|${nameKey(r.name)}`, r.id);
      if (r.email) map.set(`e:${r.customerId}|${r.email.toLowerCase()}`, r.id);
    }
  }
  if (entity === "rates") {
    const list = await tx
      .select({ laneId: rateLanes.id, vendorId: rateSheets.vendorId, pol: rateLanes.pol, pod: rateLanes.pod, containerType: rateLanes.containerType, from: rateSheets.validFrom, until: rateSheets.validUntil })
      .from(rateLanes)
      .innerJoin(rateSheets, eq(rateLanes.rateSheetId, rateSheets.id))
      .innerJoin(vendors, eq(rateSheets.vendorId, vendors.id))
      .where(eq(vendors.organizationId, organizationId));
    const bkk = (d: Date) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    for (const r of list) map.set([r.vendorId, r.pol, r.pod, r.containerType ?? "", bkk(r.from), bkk(r.until)].join("|"), r.laneId);
  }
  if (entity === "jobs") {
    const numbers = rows.map((r) => String(r.data.jobNumber ?? "").trim()).filter(Boolean);
    if (numbers.length) {
      const hits = await tx.select({ id: jobs.id, jobNumber: jobs.jobNumber, org: jobs.organizationId }).from(jobs).where(inArray(jobs.jobNumber, numbers));
      for (const h of hits) map.set(h.org === organizationId ? `job:${h.jobNumber}` : `other:${h.jobNumber}`, h.id);
    }
    const trips = await tx
      .select({ id: jobs.id, customerId: jobs.customerId, pol: jobs.pol, pod: jobs.pod, etd: jobs.etd, vessel: jobs.vessel })
      .from(jobs)
      .where(and(eq(jobs.organizationId, organizationId), sql`${jobs.etd} is not null`));
    for (const j of trips) map.set(`trip:${j.customerId}|${j.pol}|${j.pod}|${j.etd}|${nameKey(j.vessel)}`, j.id);
    const bookings = rows.map((r) => String(r.data.bookingNumber ?? "").trim()).filter(Boolean);
    if (bookings.length) {
      const hits = await tx
        .select({ id: jobs.id, b: jobs.bookingNumber })
        .from(jobs)
        .where(and(eq(jobs.organizationId, organizationId), inArray(jobs.bookingNumber, bookings)));
      for (const h of hits) if (h.b) map.set(`bkg:${h.b}`, h.id);
    }
  }
  return map;
}

async function vendorIndex(tx: Tx, organizationId: string) {
  const list = await tx
    .select({ id: vendors.id, company: vendors.company, nameTh: vendors.nameTh, nameZh: vendors.nameZh })
    .from(vendors)
    .where(eq(vendors.organizationId, organizationId));
  const map = new Map<string, string>();
  for (const r of list) for (const n of [r.company, r.nameTh, r.nameZh]) if (nameKey(n) && !map.has(nameKey(n))) map.set(nameKey(n), r.id);
  return map;
}

/* ── Batch ────────────────────────────────────────────────────── */

export async function runImport(
  db: Db,
  input: { organizationId: string; userId: string; entity: ImportEntity; fileName: string; rows: ImportRowIn[]; dryRun: boolean },
): Promise<ImportResult> {
  const { organizationId, entity, rows, dryRun } = input;
  let out: ImportResult | null = null;
  try {
    await db.transaction(async (tx) => {
      const ctx: Ctx = {
        tx,
        organizationId,
        userId: input.userId,
        items: [],
        seen: new Set(),
        existing: await existingKeys(tx, entity, organizationId, rows),
      };
      if (entity !== "rates") ctx.customers = await customerIndex(tx, organizationId);
      if (entity === "rates") ctx.vendors = await vendorIndex(tx, organizationId);

      const results: ImportRowResult[] = [];
      for (const r of rows) {
        const check = validateRow(entity, r.data);
        // Report an unknown customer together with the other problems, not one at a time.
        if (check.errors.length && ctx.customers && (entity === "contacts" || entity === "jobs") && check.values.customer) {
          const m = matchCustomer(ctx.customers, check.values.customer);
          if (m.error) check.errors.push({ field: "customer", code: m.error });
        }
        if (check.errors.length) {
          results.push({ row: r.row, status: "error", errors: check.errors, warnings: check.warnings });
          continue;
        }
        let outcome: RowOutcome;
        const mark = ctx.items.length;
        try {
          outcome = await tx.transaction(async (sp) => {
            const rowCtx = { ...ctx, tx: sp as unknown as Tx };
            const o =
              entity === "customers"
                ? await importCustomer(rowCtx, check.values)
                : entity === "contacts"
                  ? await importContact(rowCtx, check.values)
                  : entity === "rates"
                    ? await importRate(rowCtx, check.values)
                    : await importJob(rowCtx, check.values);
            if (o.status === "error") throw Object.assign(new Rollback("row"), { outcome: o });
            return o;
          });
        } catch (e) {
          // Savepoint rolled back: forget what it created (including a vendor it added to the index).
          for (const it of ctx.items.splice(mark)) {
            if (it.type === "vendor") for (const [k, vId] of ctx.vendors ?? []) if (vId === it.id) ctx.vendors!.delete(k);
          }
          if (e instanceof Rollback) outcome = (e as Rollback & { outcome: RowOutcome }).outcome;
          else {
            const code = pgCode(e);
            outcome = { status: "error", errors: [{ field: "", code: code === "23505" ? "duplicate" : "db_error" }] };
            if (!code) console.error("[import] row", r.row, e);
          }
        }
        if (outcome.status === "error") {
          results.push({ row: r.row, status: "error", errors: outcome.errors, warnings: check.warnings });
        } else {
          if (outcome.status === "created" && ctx.customers && entity === "customers") {
            addCustomer(ctx.customers, outcome.id, [check.values.nameTh as string, check.values.nameEn as string, check.values.nameZh as string], check.values.taxId as string, outcome.label);
          }
          results.push({
            row: r.row,
            status: outcome.status === "created" && dryRun ? "ready" : outcome.status,
            id: outcome.status === "created" && dryRun ? undefined : outcome.id,
            label: outcome.label,
            errors: [],
            warnings: [...check.warnings, ...(outcome.warnings ?? [])],
          });
        }
      }

      const summary = {
        total: results.length,
        created: results.filter((r) => r.status === "created").length,
        ready: results.filter((r) => r.status === "ready").length,
        duplicate: results.filter((r) => r.status === "duplicate").length,
        error: results.filter((r) => r.status === "error").length,
      };
      out = { batchId: null, dryRun, results, summary };
      if (dryRun) throw new Rollback("dry_run");

      if (summary.created > 0) {
        const batchId = uid("imp");
        await tx.insert(importBatches).values({
          id: batchId,
          organizationId,
          entity,
          fileName: input.fileName.slice(0, 200),
          createdBy: input.userId,
          rowCount: summary.total,
          createdCount: summary.created,
          duplicateCount: summary.duplicate,
          errorCount: summary.error,
          items: ctx.items,
        });
        await writeAudit(tx as unknown as Db, {
          userId: input.userId,
          action: "IMPORT_BATCH_CREATED",
          entityType: "import_batch",
          entityId: batchId,
          newValue: { entity, fileName: input.fileName, summary, items: ctx.items },
        });
        out.batchId = batchId;
      }
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out!;
}

export type ImportBatchDto = {
  id: string;
  entity: string;
  fileName: string;
  createdBy: string | null;
  createdByName: string | null;
  rowCount: number;
  createdCount: number;
  duplicateCount: number;
  errorCount: number;
  createdAt: string;
  undoneAt: string | null;
  /** Still inside the undo window and not undone yet. */
  undoable: boolean;
};

export function undoDeadline(createdAt: Date) {
  return new Date(createdAt.getTime() + IMPORT_UNDO_HOURS * 3600000);
}

export async function listImportBatches(db: Db, organizationId: string, limit = 30): Promise<ImportBatchDto[]> {
  const rows = await db
    .select({ b: importBatches, name: users.name, nameTh: users.nameTh })
    .from(importBatches)
    .leftJoin(users, eq(importBatches.createdBy, users.id))
    .where(eq(importBatches.organizationId, organizationId))
    .orderBy(desc(importBatches.createdAt))
    .limit(Math.min(limit, 100));
  const now = new Date();
  return rows.map(({ b, name, nameTh }) => ({
    id: b.id,
    entity: b.entity,
    fileName: b.fileName,
    createdBy: b.createdBy,
    createdByName: nameTh || name || null,
    rowCount: b.rowCount,
    createdCount: b.createdCount,
    duplicateCount: b.duplicateCount,
    errorCount: b.errorCount,
    createdAt: b.createdAt.toISOString(),
    undoneAt: b.undoneAt ? b.undoneAt.toISOString() : null,
    undoable: !b.undoneAt && now < undoDeadline(b.createdAt),
  }));
}

export async function getImportBatch(db: Db, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, id), eq(importBatches.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export class ImportUndoError extends Error {
  code: "not_found" | "already_undone" | "expired" | "in_use";
  constructor(code: ImportUndoError["code"]) {
    super(code);
    this.code = code;
  }
}

/** Delete everything a batch created (newest first). All or nothing. */
export async function undoImportBatch(db: Db, organizationId: string, id: string, userId: string, now = new Date()) {
  const batch = await getImportBatch(db, organizationId, id);
  if (!batch) throw new ImportUndoError("not_found");
  if (batch.undoneAt) throw new ImportUndoError("already_undone");
  if (now >= undoDeadline(batch.createdAt)) throw new ImportUndoError("expired");
  const orgCustomers = db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, organizationId));
  const orgVendors = db.select({ id: vendors.id }).from(vendors).where(eq(vendors.organizationId, organizationId));
  let removed = 0;
  try {
    await db.transaction(async (tx) => {
      for (const it of [...batch.items].reverse()) {
        let n: { id: string }[] = [];
        if (it.type === "job") n = await tx.delete(jobs).where(and(eq(jobs.id, it.id), eq(jobs.organizationId, organizationId))).returning({ id: jobs.id });
        if (it.type === "contact") n = await tx.delete(contacts).where(and(eq(contacts.id, it.id), inArray(contacts.customerId, orgCustomers))).returning({ id: contacts.id });
        if (it.type === "customer") n = await tx.delete(customers).where(and(eq(customers.id, it.id), eq(customers.organizationId, organizationId))).returning({ id: customers.id });
        if (it.type === "rate_sheet") n = await tx.delete(rateSheets).where(and(eq(rateSheets.id, it.id), inArray(rateSheets.vendorId, orgVendors))).returning({ id: rateSheets.id });
        if (it.type === "vendor") n = await tx.delete(vendors).where(and(eq(vendors.id, it.id), eq(vendors.organizationId, organizationId))).returning({ id: vendors.id });
        removed += n.length;
      }
      await tx.update(importBatches).set({ undoneAt: now, undoneBy: userId }).where(eq(importBatches.id, id));
      await writeAudit(tx as unknown as Db, {
        userId,
        action: "IMPORT_BATCH_UNDONE",
        entityType: "import_batch",
        entityId: id,
        oldValue: { entity: batch.entity, items: batch.items },
        newValue: { removed },
      });
    });
  } catch (e) {
    if (pgCode(e) === "23503") throw new ImportUndoError("in_use");
    throw e;
  }
  return { removed };
}
