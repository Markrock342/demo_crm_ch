import { existsSync, readFileSync } from "node:fs";
import { getDb, closeDb } from "./index.js";
import { eq } from "drizzle-orm";
import { seedAuth } from "../services/auth.service.js";
import { hashAccessCode } from "../services/portal-access.service.js";
import { customers } from "./schema/crm.js";
import { seedCommsFromDemo } from "../services/comms.service.js";
import { seedCrmFromDemo } from "../services/crm.service.js";
import { seedCommercial } from "./seed-commercial.js";
import { seedOperations } from "./seed-operations.js";
import { seedSales } from "./seed-sales.js";
import { seedFinance } from "./seed-finance.js";
import { syncDocSequences } from "./seed-sequences.js";

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

/** Known portal code for the test customer (c1) so the login page's test buttons can open the portal. */
export const TEST_PORTAL = { customerId: "c1", email: "hai@huayun-sz.cn", code: "TEST-2026" };

async function seedTestPortalAccess(db: NonNullable<ReturnType<typeof getDb>>) {
  if (process.env.SEED_TEST_ACCOUNTS === "false") return;
  await db
    .update(customers)
    .set({ portalPin: await hashAccessCode(TEST_PORTAL.code) })
    .where(eq(customers.id, TEST_PORTAL.customerId));
}

async function main() {
  loadDotEnv(".env");
  const db = getDb();
  if (!db) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  await seedAuth(db);
  const crm = await seedCrmFromDemo(db);
  const commercial = await seedCommercial(db);
  const operations = await seedOperations(db);
  const comms = await seedCommsFromDemo(db);
  await syncDocSequences(db);
  const sales = await seedSales(db);
  const finance = await seedFinance(db);
  await seedTestPortalAccess(db);
  await closeDb();
  console.log("Seed complete — demo users: admin@cangzhan.com / demo123 (+ sales, ops, finance)");
  if (!crm.skipped) {
    console.log(`CRM seed: ${crm.customers} customers, ${crm.contacts} contacts, ${crm.leads} leads, ${crm.opportunities} opportunities`);
  }
  if (!commercial.skipped) {
    console.log(`Commercial seed: ${commercial.vendors} vendors, ${commercial.lanes} rate lanes`);
  }
  if (!operations.skipped) {
    console.log(`Operations seed: ${operations.jobs} jobs, ${operations.containers} containers`);
  }
  if (!comms.skipped) {
    console.log(`Comms seed: ${comms.mails} mails, ${comms.docs} docs`);
  }
  console.log(`Sales seed: ${sales.quotations} quotations, ${sales.leads} leads, ${sales.deals} deals, ${sales.docs} docs, ${sales.mails} extra mails`);
  console.log(`Finance seed: ${finance.invoices} invoices, ${finance.payments} payments, ${finance.billingNotes} billing notes, ${finance.vendorBills} vendor bills`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
