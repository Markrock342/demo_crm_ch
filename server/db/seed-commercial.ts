import type { Db } from "../db/index.js";
import { rateCharges, rateLanes, rateSheets, vendors } from "../db/schema/commercial.js";
import { sql } from "drizzle-orm";

export async function seedCommercial(db: Db) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(vendors);
  if (count > 0) return { skipped: true };

  await db.insert(vendors).values([
    {
      id: "v1",
      company: "COSCO Shipping Lines",
      vendorType: "SHIPPING_LINE",
      taxId: "TH-COSCO-001",
      address: "Bangkok Office",
      paymentTermsDays: 30,
      currencies: "USD,THB",
      services: "Ocean FCL",
      status: "ACTIVE",
    },
    {
      id: "v2",
      company: "MSC Mediterranean",
      vendorType: "SHIPPING_LINE",
      taxId: "TH-MSC-001",
      address: "Laem Chabang",
      paymentTermsDays: 30,
      currencies: "USD,THB",
      services: "Ocean FCL",
      status: "ACTIVE",
    },
    {
      id: "v3",
      company: "Laem Chabang Terminal",
      vendorType: "DEPOT",
      taxId: "TH-LCT-001",
      address: "LCB",
      paymentTermsDays: 15,
      currencies: "THB",
      services: "THC, Handling",
      status: "ACTIVE",
    },
  ]);

  const validFrom = new Date("2026-01-01");
  const validUntil = new Date("2026-12-31");

  await db.insert(rateSheets).values([
    { id: "rs1", vendorId: "v1", name: "COSCO Asia-Thailand 2026", carrier: "COSCO", validFrom, validUntil, currency: "USD" },
    { id: "rs2", vendorId: "v2", name: "MSC Shanghai-LCB 2026", carrier: "MSC", validFrom, validUntil, currency: "USD" },
  ]);

  await db.insert(rateLanes).values([
    {
      id: "rl-sh-lcb-40hc",
      rateSheetId: "rs2",
      origin: "Shanghai",
      destination: "Laem Chabang",
      pol: "CNSHA",
      pod: "THLCH",
      mode: "SEA_FCL",
      containerType: "40HC",
      commodity: "General",
    },
    {
      id: "rl-yt-lcb-40hc",
      rateSheetId: "rs1",
      origin: "Yantian",
      destination: "Laem Chabang",
      pol: "CNYTN",
      pod: "THLCH",
      mode: "SEA_FCL",
      containerType: "40HC",
    },
  ]);

  await db.insert(rateCharges).values([
    {
      id: "rc1",
      rateLaneId: "rl-sh-lcb-40hc",
      chargeCode: "OCEAN_FREIGHT",
      description: "Ocean Freight",
      side: "BUY",
      unit: "PER_CONTAINER",
      quantity: "1",
      unitPrice: "850",
      currency: "USD",
    },
    {
      id: "rc2",
      rateLaneId: "rl-sh-lcb-40hc",
      chargeCode: "THC_ORIGIN",
      description: "THC Origin",
      side: "BUY",
      unit: "PER_CONTAINER",
      quantity: "1",
      unitPrice: "120",
      currency: "USD",
    },
    {
      id: "rc3",
      rateLaneId: "rl-sh-lcb-40hc",
      chargeCode: "DOC_FEE",
      description: "Documentation Fee",
      side: "BUY",
      unit: "PER_BL",
      quantity: "1",
      unitPrice: "35",
      currency: "USD",
    },
    {
      id: "rc4",
      rateLaneId: "rl-yt-lcb-40hc",
      chargeCode: "OCEAN_FREIGHT",
      description: "Ocean Freight",
      side: "BUY",
      unit: "PER_CONTAINER",
      quantity: "1",
      unitPrice: "780",
      currency: "USD",
    },
  ]);

  return { skipped: false, vendors: 3, lanes: 2 };
}
