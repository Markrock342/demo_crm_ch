import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { rateCharges, rateLanes, rateSheets, vendors } from "../db/schema/commercial.js";
import { canViewBuyRate, canViewMargin, type RoleCode } from "../domain/rbac.js";
import { d, grossProfit, marginPct, mul, toDb } from "../lib/money.js";

export type RateSearchRow = {
  laneId: string;
  sheetId: string;
  vendorId: string;
  vendor: string;
  carrier: string | null;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  containerType: string | null;
  validFrom: Date;
  validUntil: Date;
  currency: string;
  totalBuy: string | null;
  totalSell: string | null;
  margin: string | null;
  marginPct: string | null;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";
};

function rateStatus(validFrom: Date, validUntil: Date): RateSearchRow["status"] {
  const now = new Date();
  if (now > validUntil) return "EXPIRED";
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (now >= validFrom && validUntil <= soon) return "EXPIRING_SOON";
  return "ACTIVE";
}

export async function listVendors(db: Db, organizationId: string) {
  return db.select().from(vendors).where(eq(vendors.organizationId, organizationId)).orderBy(vendors.company);
}

export const VENDOR_TYPES = ["SHIPPING_LINE", "TRUCKING", "CUSTOMS", "DEPOT", "WAREHOUSE", "OTHER"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export async function createVendor(
  db: Db,
  organizationId: string,
  input: {
    company: string;
    nameZh?: string | null;
    nameTh?: string | null;
    vendorType: VendorType;
    currency?: string;
    paymentTermsDays?: number;
    taxId?: string | null;
    address?: string | null;
    services?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  },
) {
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const id = `v${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const [row] = await db
    .insert(vendors)
    .values({
      id,
      organizationId,
      company: input.company.trim(),
      nameZh: clean(input.nameZh),
      nameTh: clean(input.nameTh),
      vendorType: input.vendorType,
      currencies: (input.currency ?? "THB").toUpperCase(),
      paymentTermsDays: input.paymentTermsDays ?? 30,
      taxId: clean(input.taxId),
      address: clean(input.address),
      services: clean(input.services),
      contactName: clean(input.contactName),
      contactEmail: clean(input.contactEmail),
      contactPhone: clean(input.contactPhone),
      status: "ACTIVE",
    })
    .returning();
  return row!;
}

export async function searchRates(
  db: Db,
  opts: {
    origin?: string;
    destination?: string;
    pol?: string;
    pod?: string;
    mode?: string;
    containerType?: string;
    validOn?: Date;
    roles: RoleCode[];
    /** Only rates whose vendor belongs to this organization (tenant boundary). */
    organizationId?: string;
    /** Also list rates that start later (validFrom in the future). */
    includeUpcoming?: boolean;
  },
) {
  const validOn = opts.validOn ?? new Date();
  const where = and(
    opts.organizationId ? eq(vendors.organizationId, opts.organizationId) : undefined,
    opts.origin ? ilike(rateLanes.origin, `%${opts.origin}%`) : undefined,
    opts.destination ? ilike(rateLanes.destination, `%${opts.destination}%`) : undefined,
    opts.pol ? ilike(rateLanes.pol, `%${opts.pol}%`) : undefined,
    opts.pod ? ilike(rateLanes.pod, `%${opts.pod}%`) : undefined,
    opts.mode ? eq(rateLanes.mode, opts.mode) : undefined,
    opts.containerType ? eq(rateLanes.containerType, opts.containerType) : undefined,
    opts.includeUpcoming && !opts.validOn ? undefined : lte(rateSheets.validFrom, validOn),
    gte(rateSheets.validUntil, validOn),
  );

  const rows = await db
    .select({
      lane: rateLanes,
      sheet: rateSheets,
      vendor: vendors,
    })
    .from(rateLanes)
    .innerJoin(rateSheets, eq(rateLanes.rateSheetId, rateSheets.id))
    .innerJoin(vendors, eq(rateSheets.vendorId, vendors.id))
    .where(where)
    .orderBy(desc(rateSheets.validUntil));

  const showBuy = canViewBuyRate(opts.roles);
  const showMargin = canViewMargin(opts.roles);

  const out: RateSearchRow[] = [];
  for (const r of rows) {
    const charges = await db.select().from(rateCharges).where(eq(rateCharges.rateLaneId, r.lane.id));
    let totalBuy = d(0);
    let totalSell = d(0);
    for (const c of charges) {
      const amt = mul(c.quantity ?? "1", c.unitPrice);
      if (c.side === "BUY") totalBuy = totalBuy.plus(amt);
      if (c.side === "SELL") totalSell = totalSell.plus(amt);
    }
    if (totalSell.isZero() && !totalBuy.isZero()) {
      totalSell = totalBuy.times(1.15);
    }
    const margin = grossProfit(totalSell, totalBuy);
    out.push({
      laneId: r.lane.id,
      sheetId: r.sheet.id,
      vendorId: r.vendor.id,
      vendor: r.vendor.company,
      carrier: r.sheet.carrier,
      origin: r.lane.origin,
      destination: r.lane.destination,
      pol: r.lane.pol,
      pod: r.lane.pod,
      mode: r.lane.mode,
      containerType: r.lane.containerType,
      validFrom: r.sheet.validFrom,
      validUntil: r.sheet.validUntil,
      currency: r.sheet.currency,
      totalBuy: showBuy ? toDb(totalBuy) : null,
      totalSell: toDb(totalSell),
      margin: showMargin ? toDb(margin) : null,
      marginPct: showMargin ? toDb(marginPct(totalSell, totalBuy)) : null,
      status: rateStatus(r.sheet.validFrom, r.sheet.validUntil),
    });
  }
  return out;
}

export async function getRateLaneCharges(db: Db, laneId: string, roles: RoleCode[]) {
  const [laneRow] = await db.select().from(rateLanes).where(eq(rateLanes.id, laneId)).limit(1);
  if (!laneRow) return null;
  const charges = await db.select().from(rateCharges).where(eq(rateCharges.rateLaneId, laneId));
  const showBuy = canViewBuyRate(roles);
  return {
    lane: laneRow,
    charges: charges.map((c) => ({
      ...c,
      unitPrice: c.side === "BUY" && !showBuy ? null : c.unitPrice,
    })),
  };
}

export type ChargeInput = {
  chargeCode: string;
  description: string;
  side: "BUY" | "SELL";
  unit: string;
  quantity: string;
  unitPrice: string;
  currency: string;
};

export async function createRateSheetWithLane(
  db: Db,
  input: {
    vendorId: string;
    name: string;
    carrier?: string;
    validFrom: Date;
    validUntil: Date;
    currency: string;
    lane: {
      origin: string;
      destination: string;
      pol: string;
      pod: string;
      mode: string;
      containerType?: string;
    };
    charges: ChargeInput[];
  },
) {
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const sheetId = `rs${stamp}`;
  const laneId = `rl${stamp}`;
  await db.insert(rateSheets).values({
    id: sheetId,
    vendorId: input.vendorId,
    name: input.name,
    carrier: input.carrier ?? null,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    currency: input.currency,
  });
  await db.insert(rateLanes).values({
    id: laneId,
    rateSheetId: sheetId,
    origin: input.lane.origin,
    destination: input.lane.destination,
    pol: input.lane.pol,
    pod: input.lane.pod,
    mode: input.lane.mode,
    containerType: input.lane.containerType ?? null,
  });
  for (const [i, c] of input.charges.entries()) {
    await db.insert(rateCharges).values({
      id: `rc${stamp}${i}`,
      rateLaneId: laneId,
      chargeCode: c.chargeCode,
      description: c.description,
      side: c.side,
      unit: c.unit,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      currency: c.currency,
    });
  }
  return { sheetId, laneId };
}

// ---------------------------------------------------------------------------
// Tenant-scoped rate management (Rates page "add / edit / expire rate").
// A rate lane belongs to an organization through its sheet's vendor.

async function laneInOrg(db: Db, organizationId: string, laneId: string) {
  const [row] = await db
    .select({ lane: rateLanes, sheet: rateSheets, vendor: vendors })
    .from(rateLanes)
    .innerJoin(rateSheets, eq(rateLanes.rateSheetId, rateSheets.id))
    .innerJoin(vendors, eq(rateSheets.vendorId, vendors.id))
    .where(and(eq(rateLanes.id, laneId), eq(vendors.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** Lane + sheet + charges for editing; BUY prices hidden unless the role may see them. */
export async function getRateLaneForOrg(db: Db, organizationId: string, laneId: string, roles: RoleCode[]) {
  const row = await laneInOrg(db, organizationId, laneId);
  if (!row) return null;
  const charges = await db.select().from(rateCharges).where(eq(rateCharges.rateLaneId, laneId));
  const showBuy = canViewBuyRate(roles);
  return {
    lane: row.lane,
    sheet: row.sheet,
    vendor: { id: row.vendor.id, company: row.vendor.company },
    charges: charges.map((c) => ({ ...c, unitPrice: c.side === "BUY" && !showBuy ? null : c.unitPrice })),
  };
}

export async function vendorInOrg(db: Db, organizationId: string, vendorId: string) {
  const [v] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
    .limit(1);
  return Boolean(v);
}

export type RateLanePatch = {
  vendorId?: string;
  name?: string;
  carrier?: string | null;
  validFrom?: Date;
  validUntil?: Date;
  currency?: string;
  containerType?: string | null;
  charges?: ChargeInput[];
  /** Ends the rate now (validUntil = now). */
  expire?: boolean;
};

/** Update a lane and its sheet (sheets created from the Rates page hold exactly one lane). Null if not in the org. */
export async function updateRateLane(db: Db, organizationId: string, laneId: string, patch: RateLanePatch) {
  const row = await laneInOrg(db, organizationId, laneId);
  if (!row) return null;
  const sheetSet: Partial<typeof rateSheets.$inferInsert> = {};
  if (patch.vendorId !== undefined) sheetSet.vendorId = patch.vendorId;
  if (patch.name !== undefined) sheetSet.name = patch.name;
  if (patch.carrier !== undefined) sheetSet.carrier = patch.carrier;
  if (patch.validFrom !== undefined) sheetSet.validFrom = patch.validFrom;
  if (patch.validUntil !== undefined) sheetSet.validUntil = patch.validUntil;
  if (patch.currency !== undefined) sheetSet.currency = patch.currency;
  if (patch.expire) {
    const now = new Date();
    sheetSet.validUntil = now;
    if (row.sheet.validFrom > now) sheetSet.validFrom = now;
  }
  const from = sheetSet.validFrom ?? row.sheet.validFrom;
  const until = sheetSet.validUntil ?? row.sheet.validUntil;
  if (until < from) throw new Error("valid_range");

  await db.transaction(async (tx) => {
    if (Object.keys(sheetSet).length) {
      await tx.update(rateSheets).set({ ...sheetSet, updatedAt: new Date() }).where(eq(rateSheets.id, row.sheet.id));
    }
    if (patch.containerType !== undefined) {
      await tx.update(rateLanes).set({ containerType: patch.containerType }).where(eq(rateLanes.id, laneId));
    }
    if (patch.charges) {
      await tx.delete(rateCharges).where(eq(rateCharges.rateLaneId, laneId));
      const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      for (const [i, c] of patch.charges.entries()) {
        await tx.insert(rateCharges).values({ id: `rc${stamp}${i}`, rateLaneId: laneId, ...c });
      }
    }
  });
  return { laneId, sheetId: row.sheet.id, before: { sheet: row.sheet, lane: row.lane } };
}
