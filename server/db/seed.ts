import { existsSync, readFileSync } from "node:fs";
import { getDb, closeDb } from "./index.js";
import { seedAuth } from "../services/auth.service.js";
import { seedCrmFromDemo } from "../services/crm.service.js";

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

async function main() {
  loadDotEnv(".env");
  const db = getDb();
  if (!db) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  await seedAuth(db);
  const crm = await seedCrmFromDemo(db);
  await closeDb();
  console.log("Seed complete — demo users: admin@cangzhan.com / demo123 (+ sales, ops, finance)");
  if (!crm.skipped) {
    console.log(`CRM seed: ${crm.customers} customers, ${crm.contacts} contacts, ${crm.leads} leads, ${crm.opportunities} opportunities`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
