/**
 * Synthetic "years of data" dataset for load testing — lives in its own organization
 * (slug `loadtest-scale`) so it never mixes with real or demo data.
 *
 *   LOADTEST_PASSWORD=... npx tsx scripts/scale-data.ts create   # 1,000 customers · 5,000 jobs · 10,000 invoices …
 *   npx tsx scripts/scale-data.ts remove                         # deletes the org and everything in it
 *   npx tsx scripts/scale-data.ts create --jobs 20000 --customers 3000 --invoices 40000
 *
 * Refuses to run against a non-local DATABASE_URL unless --force is given.
 * The login it creates (loadtest@scale.local) is what scripts/loadtest.mjs signs in with.
 */
import { existsSync, readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import postgres from "postgres";

const ORG_ID = "33333333-3333-4333-8333-333333333333";
const ORG_SLUG = "loadtest-scale";
const EMAIL = "loadtest@scale.local";
const P = "lt-"; // id prefix for every synthetic row

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

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) || def : def;
}

const POLS = ["CNSHA", "CNNGB", "CNSZX", "CNTAO", "CNXMN", "CNTSN", "THLCH", "THBKK"];
const PODS = ["THLCH", "THBKK", "THLKR", "CNSHA", "CNNGB", "VNSGN", "MYPKG"];
const CARRIERS = ["COSCO", "Evergreen", "ONE", "Maersk", "SITC", "Wan Hai", "RCL"];
const VESSELS = ["COSCO HOPE", "EVER GIVEN", "ONE APUS", "MAERSK KOLKATA", "SITC OSAKA", "WAN HAI 305", "RCL SUNSHINE"];
const MS = [
  ["BOOKING", "Booking confirmed"],
  ["SI", "SI submitted"],
  ["GATE_IN", "Gate-in"],
  ["LOADED", "Loaded on vessel"],
  ["SAILED", "Vessel sailed"],
  ["ARRIVED", "Arrived"],
  ["CLEAR", "Customs cleared"],
  ["DELIVERED", "Delivered"],
] as const;
const STATUSES = ["BOOKING", "GATE_IN", "SAIL", "ARRIVED", "DELIVERED"];
const INV_STATUSES = ["DRAFT", "ISSUED", "ISSUED", "PARTIALLY_PAID", "PAID", "PAID", "PAID"];
const CT_STATUS = ["yard", "sail", "clear", "hold", "empty"];

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const pad = (n: number, w = 6) => String(n).padStart(w, "0");
const day = (offset: number) => new Date(Date.now() + offset * 86400000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function insertChunked(sql: postgres.Sql, table: string, rows: Record<string, unknown>[], size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    await sql`INSERT INTO ${sql(table)} ${sql(rows.slice(i, i + size) as never)}`;
  }
}

async function remove(sql: postgres.Sql) {
  const t0 = Date.now();
  await sql.begin(async (tx) => {
    const org = ORG_ID;
    const jobIds = tx`SELECT id FROM jobs WHERE organization_id = ${org}`;
    const invIds = tx`SELECT id FROM invoices WHERE organization_id = ${org}`;
    const custIds = tx`SELECT id FROM customers WHERE organization_id = ${org}`;
    await tx`DELETE FROM payment_allocations WHERE invoice_id IN (${invIds})`;
    await tx`DELETE FROM billing_note_items WHERE invoice_id IN (${invIds})`;
    await tx`DELETE FROM billing_notes WHERE customer_id IN (${custIds})`;
    await tx`DELETE FROM payments WHERE customer_id IN (${custIds})`;
    await tx`DELETE FROM invoice_lines WHERE invoice_id IN (${invIds})`;
    await tx`DELETE FROM invoices WHERE organization_id = ${org}`;
    // Anything the app itself may have created in the test org while it was exercised.
    for (const t of [
      "activities", "tasks", "job_tasks", "notifications", "notification_channels", "automation_rules", "crm_docs",
      "mails", "import_batches", "document_templates", "organization_profiles", "vendor_bills", "leads", "audit_logs",
    ]) {
      await tx.unsafe(`DELETE FROM ${t} WHERE organization_id = $1`, [org]);
    }
    await tx`DELETE FROM containers WHERE organization_id = ${org}`;
    await tx`DELETE FROM shipment_charges WHERE job_id IN (${jobIds})`;
    await tx`DELETE FROM job_milestones WHERE job_id IN (${jobIds})`;
    await tx`DELETE FROM jobs WHERE organization_id = ${org}`;
    await tx`DELETE FROM bookings WHERE customer_id IN (${custIds})`;
    await tx`DELETE FROM contacts WHERE customer_id IN (${custIds})`;
    await tx`DELETE FROM opportunities WHERE customer_id IN (${custIds})`;
    await tx`DELETE FROM customers WHERE organization_id = ${org}`;
    await tx`DELETE FROM vendors WHERE organization_id = ${org}`;
    await tx`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE email = ${EMAIL})`;
    await tx`DELETE FROM organization_members WHERE organization_id = ${org}`;
    await tx`DELETE FROM users WHERE email = ${EMAIL}`;
    await tx`DELETE FROM organizations WHERE id = ${org}`;
  });
  console.log(`removed synthetic org ${ORG_SLUG} in ${Date.now() - t0} ms`);
}

async function create(sql: postgres.Sql) {
  const password = process.env.LOADTEST_PASSWORD?.trim();
  if (!password) throw new Error("Set LOADTEST_PASSWORD (the password for loadtest@scale.local).");
  const nCust = arg("customers", 1000);
  const nJobs = arg("jobs", 5000);
  const nInv = arg("invoices", 10000);
  const t0 = Date.now();
  await remove(sql);

  await sql`INSERT INTO organizations (id, slug, name) VALUES (${ORG_ID}, ${ORG_SLUG}, 'Load test (synthetic)')`;
  const hash = await bcrypt.hash(password, 10);
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (email, password_hash, name) VALUES (${EMAIL}, ${hash}, 'Load Test') RETURNING id`;
  await sql`INSERT INTO organization_members (organization_id, user_id, org_role) VALUES (${ORG_ID}, ${user.id}, 'owner')`;
  await sql`INSERT INTO user_roles (user_id, role_id) SELECT ${user.id}, id FROM roles WHERE code = 'SUPER_ADMIN'`;

  const customers = Array.from({ length: nCust }, (_, i) => {
    const n = pad(i + 1, 4);
    return {
      id: `${P}c${n}`,
      organization_id: ORG_ID,
      name_zh: `测试客户${n}`,
      name_th: `ลูกค้าทดสอบ ${n}`,
      name_en: `Test Customer ${n} Co., Ltd.`,
      city_zh: "上海",
      city_th: "เซี่ยงไฮ้",
      city_en: "Shanghai",
      lane_zh: "上海→林查班",
      lane_th: "เซี่ยงไฮ้→แหลมฉบัง",
      lane_en: "Shanghai→Laem Chabang",
      owner: "Load Test",
      updated: ymd(day(-Math.floor(rnd() * 700))),
      updated_at: day(-Math.floor(rnd() * 700)),
    };
  });
  await insertChunked(sql, "customers", customers);

  const jobs: Record<string, unknown>[] = [];
  const milestones: Record<string, unknown>[] = [];
  const charges: Record<string, unknown>[] = [];
  const containers: Record<string, unknown>[] = [];
  for (let i = 0; i < nJobs; i++) {
    const n = pad(i + 1);
    const id = `${P}j${n}`;
    // Spread over ~3 years; most history is closed, recent jobs are live.
    const age = Math.floor((i / nJobs) * 1100);
    const etd = day(-age + 5 - Math.floor(rnd() * 10));
    const eta = new Date(etd.getTime() + (5 + Math.floor(rnd() * 12)) * 86400000);
    const status = age > 60 ? "DELIVERED" : pick(STATUSES);
    const done = status === "DELIVERED" ? MS.length : Math.floor(rnd() * MS.length);
    const cust = customers[Math.floor(rnd() * nCust)];
    jobs.push({
      id,
      organization_id: ORG_ID,
      job_number: `LT-${n}`,
      customer_id: cust.id,
      mode: "SEA_FCL",
      origin: pick(POLS),
      destination: pick(PODS),
      pol: pick(POLS),
      pod: pick(PODS),
      carrier: pick(CARRIERS),
      vessel: pick(VESSELS),
      voyage: `${100 + (i % 800)}S`,
      etd: ymd(etd),
      eta: ymd(eta),
      container_type: "40HC",
      container_count: 1 + (i % 3),
      teu: 2 * (1 + (i % 3)),
      sales_owner_id: user.id,
      assigned_operator: user.id,
      status,
      currency: "THB",
      created_at: day(-age - 3),
      updated_at: day(-age),
    });
    MS.forEach(([code, label], k) => {
      const planned = new Date(etd.getTime() + (k - 4) * 86400000);
      milestones.push({
        id: `${P}m${n}-${k}`,
        job_id: id,
        code,
        label,
        planned_at: planned,
        actual_at: k < done ? planned : null,
        sort_order: k,
      });
    });
    const sell = 30000 + Math.floor(rnd() * 40000);
    const buy = Math.floor(sell * (0.7 + rnd() * 0.2));
    for (const [k, type, amt] of [
      [0, "REVENUE", sell],
      [1, "COST", buy],
    ] as const) {
      charges.push({
        id: `${P}ch${n}-${k}`,
        job_id: id,
        charge_code: k ? "OF-COST" : "OF",
        charge_type: type,
        source: "MANUAL",
        description: k ? "Ocean freight (cost)" : "Ocean freight",
        quantity: "1",
        unit: "BL",
        currency: "THB",
        unit_amount: String(amt),
        total_amount: String(amt),
        customer_id: cust.id,
      });
    }
    if (i % 2 === 0) {
      containers.push({
        id: `${P}ct${n}`,
        organization_id: ORG_ID,
        job_id: id,
        customer_id: cust.id,
        container_no: `LTSU${pad(i + 1, 7)}`,
        type: "40HC",
        status: status === "DELIVERED" ? "empty" : pick(CT_STATUS),
        direction: i % 4 === 0 ? "in" : "out",
        teu: 2,
        eta: ymd(eta),
        vessel: pick(VESSELS),
        updated_at: day(-age),
      });
    }
  }
  await insertChunked(sql, "jobs", jobs);
  await insertChunked(sql, "job_milestones", milestones, 2000);
  await insertChunked(sql, "shipment_charges", charges, 2000);
  await insertChunked(sql, "containers", containers);

  const invoices = Array.from({ length: nInv }, (_, i) => {
    const job = jobs[i % nJobs];
    const status = (job.status === "DELIVERED" ? pick(INV_STATUSES) : pick(["DRAFT", "ISSUED"])) as string;
    const total = 20000 + Math.floor(rnd() * 50000);
    const paid = status === "PAID" ? total : status === "PARTIALLY_PAID" ? Math.floor(total / 2) : 0;
    const issue = new Date((job.created_at as Date).getTime() + 7 * 86400000);
    return {
      id: `${P}inv${pad(i + 1)}`,
      organization_id: ORG_ID,
      invoice_number: `LT-INV-${pad(i + 1)}`,
      customer_id: job.customer_id,
      job_id: job.id,
      issue_date: issue,
      due_date: new Date(issue.getTime() + 30 * 86400000),
      currency: "THB",
      subtotal: String(total),
      total: String(total),
      paid_amount: String(paid),
      balance_due: String(total - paid),
      status,
      created_at: issue,
      updated_at: issue,
    };
  });
  await insertChunked(sql, "invoices", invoices);
  await sql`ANALYZE`;
  console.log(
    `created ${ORG_SLUG}: ${nCust} customers, ${nJobs} jobs, ${milestones.length} milestones, ${charges.length} charges, ` +
      `${containers.length} containers, ${nInv} invoices in ${((Date.now() - t0) / 1000).toFixed(1)} s (login ${EMAIL})`,
  );
}

async function main() {
  loadDotEnv(".env");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !process.argv.includes("--force")) {
    throw new Error(`Refusing to touch non-local database ${host} (pass --force if you really mean it).`);
  }
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const cmd = process.argv[2];
    if (cmd === "create") await create(sql);
    else if (cmd === "remove") await remove(sql);
    else console.log("usage: npx tsx scripts/scale-data.ts create|remove [--jobs N --customers N --invoices N]");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
