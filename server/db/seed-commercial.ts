import type { Db } from "../db/index.js";
import { rateCharges, rateLanes, rateSheets, vendors } from "../db/schema/commercial.js";
import { sql } from "drizzle-orm";

import { DEMO_ORG_ID } from "../domain/tenancy.js";

/** Demo vendors with names in all three UI languages (company = legal / English name). */
const DEMO_VENDORS = [
  { id: "v1", company: "COSCO Shipping Lines (Thailand)", nameZh: "中远海运（泰国）", nameTh: "คอสโก้ ชิปปิ้ง ไลน์ (ประเทศไทย)", vendorType: "SHIPPING_LINE", taxId: "0105548123456", address: "Sathorn, Bangkok", paymentTermsDays: 30, currencies: "USD,THB", services: "Ocean FCL", contactName: "Pimchanok S.", contactEmail: "booking.th@coscon.example", contactPhone: "+66 2 123 4501" },
  { id: "v2", company: "MSC Mediterranean Shipping (Thailand)", nameZh: "地中海航运（泰国）", nameTh: "เอ็มเอสซี เมดิเตอร์เรเนียน ชิปปิ้ง (ประเทศไทย)", vendorType: "SHIPPING_LINE", taxId: "0105551234567", address: "Laem Chabang, Chonburi", paymentTermsDays: 30, currencies: "USD,THB", services: "Ocean FCL", contactName: "Wang Lei", contactEmail: "lcb.sales@msc.example", contactPhone: "+66 38 400 210" },
  { id: "v3", company: "Laem Chabang Terminal Services", nameZh: "林查班码头服务", nameTh: "บริการท่าเทียบเรือแหลมฉบัง", vendorType: "DEPOT", taxId: "0205560011223", address: "Laem Chabang Port, Chonburi", paymentTermsDays: 15, currencies: "THB", services: "THC, handling", contactName: "Somchai K.", contactEmail: "billing@lcbterminal.example", contactPhone: "+66 38 490 100" },
  { id: "v4", company: "Siam Express Trucking", nameZh: "暹罗快运车队", nameTh: "สยามเอ็กซ์เพรส ทรานสปอร์ต", vendorType: "TRUCKING", taxId: "0105562009876", address: "Bang Na, Bangkok", paymentTermsDays: 15, currencies: "THB", services: "Port haulage, cross-border trucking", contactName: "Anan R.", contactEmail: "dispatch@siamexpress.example", contactPhone: "+66 81 234 5678" },
  { id: "v5", company: "Chonburi Customs Brokerage", nameZh: "春武里报关行", nameTh: "ชลบุรี ชิปปิ้ง (ตัวแทนออกของ)", vendorType: "CUSTOMS", taxId: "0205559876543", address: "Sriracha, Chonburi", paymentTermsDays: 7, currencies: "THB", services: "Import / export customs clearance", contactName: "Kanokwan P.", contactEmail: "docs@cbcustoms.example", contactPhone: "+66 38 311 222" },
] as const;

export async function seedCommercial(db: Db) {
  // Vendors are refreshed on every run (multilingual names / contacts), rate sheets only once.
  for (const v of DEMO_VENDORS) {
    const values = { organizationId: DEMO_ORG_ID, status: "ACTIVE", ...v };
    const { id: _id, ...set } = values;
    await db.insert(vendors).values(values).onConflictDoUpdate({ target: vendors.id, set: { ...set, updatedAt: new Date() } });
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(rateSheets);
  if (count > 0) return { skipped: false, vendors: DEMO_VENDORS.length, lanes: 0 };

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

  return { skipped: false, vendors: DEMO_VENDORS.length, lanes: 2 };
}
