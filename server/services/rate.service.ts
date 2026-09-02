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

export async function listVendors(db: Db) {
  return db.select().from(vendors).orderBy(vendors.company);
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
  },
) {
  const validOn = opts.validOn ?? new Date();
  const where = and(
    opts.origin ? ilike(rateLanes.origin, `%${opts.origin}%`) : undefined,
    opts.destination ? ilike(rateLanes.destination, `%${opts.destination}%`) : undefined,
    opts.pol ? ilike(rateLanes.pol, `%${opts.pol}%`) : undefined,
    opts.pod ? ilike(rateLanes.pod, `%${opts.pod}%`) : undefined,
    opts.mode ? eq(rateLanes.mode, opts.mode) : undefined,
    opts.containerType ? eq(rateLanes.containerType, opts.containerType) : undefined,
    lte(rateSheets.validFrom, validOn),
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
  const sheetId = `rs${Date.now()}`;
  const laneId = `rl${Date.now()}`;
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
      id: `rc${Date.now()}${i}`,
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
