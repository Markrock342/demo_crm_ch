import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { computeManualLines } from "./finance.service.js";
import { legacyMailTimeToIso, legacyMailTimesToIso } from "./comms.service.js";
import { bangkokDate, demoJobCharges, milestonePlan } from "../db/seed-operations.js";
import { placeName } from "../../src/v2/lib/places.js";

const TAX = new Map([
  ["VAT7", "0.0700"],
  ["VAT0", "0.0000"],
]);

describe("computeManualLines", () => {
  it("multiplies qty × unit price and sums per-line VAT (2 dp)", () => {
    const r = computeManualLines(
      [
        { description: " Ocean freight ", qty: 2, unitPrice: "1090" },
        { description: "Doc fee", qty: "1", unitPrice: 35.5, taxCode: "VAT7" },
        { description: "THC", qty: 3, unitPrice: "0.335", taxCode: "VAT7" },
      ],
      TAX,
    );
    assert.equal(r.lines[0]!.description, "Ocean freight");
    assert.equal(r.lines[0]!.amount, "2180.0000");
    assert.equal(r.lines[1]!.tax, "2.4900"); // 35.50 × 7% = 2.485 → 2.49 (half up)
    assert.equal(r.lines[2]!.amount, "1.0100"); // 1.005 → 1.01
    assert.equal(r.subtotal, "2216.5100");
    assert.equal(r.tax, "2.5600");
    assert.equal(r.total, "2219.0700");
  });

  it("rejects unknown tax codes, empty lists and non-positive quantities", () => {
    assert.throws(() => computeManualLines([{ description: "x", qty: 1, unitPrice: 1, taxCode: "GST" }], TAX), /invalid_tax_code/);
    assert.throws(() => computeManualLines([], TAX), /no_lines/);
    assert.throws(() => computeManualLines([{ description: "x", qty: 0, unitPrice: 1 }], TAX), /invalid_line/);
    assert.throws(() => computeManualLines([{ description: "x", qty: 1, unitPrice: -5 }], TAX), /invalid_line/);
  });
});

describe("legacy mail time labels", () => {
  const now = new Date("2026-09-28T08:00:00Z"); // 15:00 Bangkok
  it("turns HH:mm / 昨 HH:mm into Bangkok timestamps", () => {
    assert.equal(legacyMailTimeToIso("14:22", now), "2026-09-28T07:22:00.000Z");
    assert.equal(legacyMailTimeToIso("昨 17:15", now), "2026-09-27T10:15:00.000Z");
    assert.equal(legacyMailTimeToIso("2026-09-01T00:00:00.000Z", now), "2026-09-01T00:00:00.000Z");
    assert.equal(legacyMailTimeToIso("last week", now), null);
  });
  it("shifts a batch so nothing lands in the future, keeping order", () => {
    const early = new Date("2026-09-27T19:00:00Z"); // 02:00 Bangkok
    const out = legacyMailTimesToIso(["14:22", "09:40", "昨 17:15"], early).map((x) => new Date(x!).getTime());
    assert.ok(out.every((t) => t <= early.getTime()));
    assert.ok(out[0]! > out[1]! && out[1]! > out[2]!);
  });
});

describe("seed milestones follow ETD / ETA", () => {
  const now = new Date("2026-09-28T05:00:00Z");
  it("sailed job: pre-departure steps done, customs still open", () => {
    const ms = milestonePlan({ etd: -4, eta: 2, status: "SAIL" }, now);
    const by = Object.fromEntries(ms.map((m) => [m.code, m]));
    assert.ok(by.SAILED!.actualAt && by.LOADED!.actualAt && by.GATE_IN!.actualAt);
    assert.equal(by.CLEAR!.actualAt, null);
    assert.ok(by.CLEAR!.plannedAt.getTime() > now.getTime());
    assert.equal(bangkokDate(by.SAILED!.plannedAt, 0), bangkokDate(now, -4));
  });
  it("delayed job (ETA passed, not arrived) has an overdue open milestone", () => {
    const ms = milestonePlan({ etd: -9, eta: -2, status: "SAIL" }, now);
    assert.ok(ms.some((m) => !m.actualAt && m.plannedAt.getTime() < now.getTime()));
  });
  it("customs-cleared job waits only on delivery; delivered job has every step done", () => {
    const cleared = milestonePlan({ etd: -13, eta: -5, status: "ARRIVED", cleared: true }, now);
    assert.deepEqual(cleared.filter((m) => !m.actualAt).map((m) => m.code), ["DELIVERED"]);
    const delivered = milestonePlan({ etd: -40, eta: -30, status: "DELIVERED" }, now);
    assert.ok(delivered.every((m) => m.actualAt));
  });
  it("demo job charges: sell and cost per line, customs only on imports", () => {
    const base = { id: "x", customerId: "c1", currency: "USD", sell: 1000, buy: 800, carrier: "COSCO" };
    const imp = demoJobCharges({ ...base, direction: "IMPORT" }, 2);
    const exp = demoJobCharges({ ...base, direction: "EXPORT" }, 2);
    assert.equal(imp.filter((c) => c.chargeType === "REVENUE").length, imp.filter((c) => c.chargeType === "COST").length);
    assert.ok(imp.some((c) => c.chargeCode === "CUSTOMS"));
    assert.ok(!exp.some((c) => c.chargeCode === "CUSTOMS"));
    assert.equal(imp.find((c) => c.id === "sc-seed-x-rev")?.totalAmount, "2000");
    assert.equal(imp.find((c) => c.id === "sc-seed-x-cost")?.vendorId, "v1");
  });
  it("booking-only job has nothing done after the booking", () => {
    const ms = milestonePlan({ etd: 5, eta: 13, status: "BOOKING" }, now);
    assert.deepEqual(
      ms.filter((m) => m.actualAt).map((m) => m.code),
      ["BOOKING"],
    );
  });
});

describe("placeName", () => {
  it("translates codes, slots and legacy Chinese labels", () => {
    assert.equal(placeName("LCB-B1", "th"), "แหลมฉบัง B1");
    assert.equal(placeName("LCB-B1", "zh"), "林查班 B1");
    assert.equal(placeName("LCB-B1", "en"), "Laem Chabang B1");
    assert.equal(placeName("林查班 C1", "en"), "Laem Chabang C1");
    assert.equal(placeName("YTN-T3", "th"), "หยานเถียน เฟส 3");
    assert.equal(placeName("A1", "en"), "A1");
    assert.equal(placeName(null, "en"), "");
  });
});

describe("create APIs require a session", () => {
  for (const [method, path] of [
    ["POST", "/api/invoices"],
    ["POST", "/api/vendor-bills"],
    ["POST", "/api/vendors"],
    ["GET", "/api/users"],
    ["GET", "/api/invoices/x/pdf"],
  ] as const) {
    it(`${method} ${path} → 401`, async () => {
      const res = await app.request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
      assert.equal(res.status, 401);
    });
  }
});

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

function isDbDown(e: unknown) {
  let cur: unknown = e;
  for (let depth = 0; depth < 6 && cur; depth++) {
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (/does not exist|ECONNREFUSED|authentication failed|connect ETIMEDOUT|database unavailable/i.test(msg)) return msg;
    cur = cur instanceof Error ? (cur as Error & { cause?: unknown }).cause : undefined;
  }
  return null;
}

describe("create APIs (HTTP, local DB)", () => {
  it("creates an invoice + PDF, a vendor and a vendor bill, then approves and pays it", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-finance";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { customers } = await import("../db/schema/crm.js");
    const { invoices, vendorBills } = await import("../db/schema/finance.js");
    const { vendors } = await import("../db/schema/commercial.js");
    const { and, eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const created: { invoice?: string; bill?: string; vendor?: string } = {};
    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, DEMO_ORG_ID)).limit(1);
      if (!admin || !cust) return t.skip("no seed data — run db:seed");

      const token = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: DEMO_ORG_ID });
      const call = (method: string, path: string, body?: unknown) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${token}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      // Invoice from scratch
      const bad = await call("POST", "/api/invoices", { customerId: cust.id, currency: "USD", lines: [] });
      assert.equal(bad.status, 400);
      const inv = await call("POST", "/api/invoices", {
        customerId: cust.id,
        currency: "usd",
        lines: [
          { description: "Ocean freight", qty: 2, unitPrice: "850" },
          { description: "Doc fee", qty: 1, unitPrice: 35.5, taxCode: "VAT7" },
        ],
      });
      assert.equal(inv.status, 201);
      const invBody = (await inv.json()) as { id: string; invoiceNumber: string; total: string; status: string; currency: string };
      created.invoice = invBody.id;
      assert.match(invBody.invoiceNumber, /^INV-\d{4}-\d{6}$/);
      assert.equal(invBody.total, "1737.9900");
      assert.equal(invBody.status, "DRAFT");
      assert.equal(invBody.currency, "USD");

      const pdf = await call("GET", `/api/invoices/${invBody.id}/pdf`);
      assert.equal(pdf.status, 200);
      assert.equal(pdf.headers.get("content-type"), "application/pdf");
      assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
      assert.equal((await call("GET", "/api/invoices/does-not-exist/pdf")).status, 404);

      // Vendor
      const ven = await call("POST", "/api/vendors", {
        company: "Test Depot Co.",
        nameZh: "测试堆场",
        nameTh: "ดีโป้ทดสอบ",
        vendorType: "depot",
        currency: "THB",
        paymentTermsDays: 15,
        contactEmail: "ops@test-depot.example",
      });
      assert.equal(ven.status, 201);
      const venBody = (await ven.json()) as { id: string; vendorType: string; organizationId: string };
      created.vendor = venBody.id;
      assert.equal(venBody.vendorType, "DEPOT");
      assert.equal(venBody.organizationId, DEMO_ORG_ID);
      assert.equal((await call("POST", "/api/vendors", { company: "x", vendorType: "spaceship" })).status, 400);

      // Vendor bill without a job, then approve → pay
      const bill = await call("POST", "/api/vendor-bills", {
        vendorId: venBody.id,
        currency: "THB",
        dueDate: "2026-12-31",
        lines: [{ description: "Lift on/off", qty: 4, unitPrice: 1250, taxCode: "VAT7" }],
      });
      assert.equal(bill.status, 201);
      const billBody = (await bill.json()) as { id: string; total: string; billNumber: string };
      created.bill = billBody.id;
      assert.equal(billBody.total, "5350.0000");
      const list = (await (await call("GET", `/api/vendor-bills?vendorId=${venBody.id}`)).json()) as { items: Array<{ id: string }> };
      assert.deepEqual(
        list.items.map((b) => b.id),
        [billBody.id],
      );
      assert.equal((await call("POST", `/api/vendor-bills/${billBody.id}/approve`)).status, 200);
      const paid = await call("POST", `/api/vendor-bills/${billBody.id}/pay`, {});
      assert.deepEqual(await paid.json(), { status: "PAID" });

      // Users directory
      const usersRes = (await (await call("GET", "/api/users")).json()) as { items: Array<{ id: string; name: string; roles: string[] }> };
      const me = usersRes.items.find((u) => u.id === admin.id);
      assert.ok(me && me.name && !("passwordHash" in me));
      assert.ok(me.roles.includes("SUPER_ADMIN"));
    } catch (e) {
      const reason = isDbDown(e);
      if (reason) return t.skip(`database unavailable: ${reason}`);
      throw e;
    } finally {
      if (created.bill) await db.delete(vendorBills).where(eq(vendorBills.id, created.bill));
      if (created.vendor) await db.delete(vendors).where(and(eq(vendors.id, created.vendor), eq(vendors.organizationId, DEMO_ORG_ID)));
      if (created.invoice) await db.delete(invoices).where(eq(invoices.id, created.invoice));
      await closeDb();
    }
  });
});
