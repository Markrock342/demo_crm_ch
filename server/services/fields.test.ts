import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { quoteSellTotals } from "./quotation.service.js";
import { totalsByCurrency } from "./pipeline.service.js";

describe("quotation sell totals", () => {
  it("sums in the quote currency and converts foreign charges by their rate", () => {
    const t = quoteSellTotals(
      [
        { sellAmount: "1000", currency: "THB", exchangeRate: "1" },
        { sellAmount: "100", currency: "USD", exchangeRate: "34.5" },
      ],
      "THB",
    );
    assert.equal(t.total, "4450.0000");
    assert.deepEqual(t.byCurrency, { THB: "1000.0000", USD: "100.0000" });
  });
  it("gives no single total when a foreign charge has no real rate", () => {
    const t = quoteSellTotals([{ sellAmount: "977.5", currency: "USD", exchangeRate: "1" }], "THB");
    assert.equal(t.total, null);
    assert.deepEqual(t.byCurrency, { USD: "977.5000" });
  });
  it("is null for a quote without charges", () => {
    assert.equal(quoteSellTotals([], "USD").total, null);
  });
});

describe("deal totals per currency", () => {
  it("groups values by currency and can skip billed deals", () => {
    const deals = [
      { value: 100, currency: "THB", stage: "quote" },
      { value: 50, currency: "USD", stage: "won" },
      { value: 30, currency: "THB", stage: "billed" },
    ];
    assert.deepEqual(totalsByCurrency(deals), { THB: 130, USD: 50 });
    assert.deepEqual(totalsByCurrency(deals, true), { THB: 100, USD: 50 });
  });
});

describe("booking / pipeline APIs require a session", () => {
  for (const [method, path] of [
    ["GET", "/api/bookings"],
    ["POST", "/api/bookings"],
    ["PATCH", "/api/bookings/x"],
    ["PATCH", "/api/jobs/x/cutoffs"],
    ["GET", "/api/opportunities"],
    ["PATCH", "/api/leads/x"],
  ] as const) {
    it(`${method} ${path} → 401`, async () => {
      const res = await app.request(`http://localhost${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : "{}",
      });
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

type Booking = {
  id: string;
  bookingNumber: string;
  stage: string;
  status: string;
  siCutoff: string | null;
  cyCutoff: string | null;
  jobs: { id: string }[];
};

describe("bookings, cut-offs, free time, deal currency and owners (HTTP, local DB)", () => {
  it("round-trips through the API with tenant checks", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-fields";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { customers, leads, opportunities } = await import("../db/schema/crm.js");
    const { bookings, containers, jobs } = await import("../db/schema/operations.js");
    const { eq, and } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const stamp = Date.now();
    const jobA = `job-test-fields-a-${stamp}`;
    const jobB = `job-test-fields-b-${stamp}`;
    const made: { bookings: string[]; deals: string[]; leads: string[] } = { bookings: [], deals: [], leads: [] };
    let boxBefore: { id: string; lastFreeDay: string | null; freeDays: number | null } | undefined;
    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      const [sales] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sales@cangzhan.com")).limit(1);
      const [c1] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, "c1"), eq(customers.organizationId, DEMO_ORG_ID))).limit(1);
      const [c2] = await db.select({ id: customers.id }).from(customers).where(and(eq(customers.id, "c2"), eq(customers.organizationId, DEMO_ORG_ID))).limit(1);
      if (!admin || !sales || !c1 || !c2) return t.skip("no seed data — run db:seed");

      const token = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: DEMO_ORG_ID });
      const call = (method: string, path: string, body?: unknown) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${token}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      const base = { organizationId: DEMO_ORG_ID, mode: "SEA_FCL", origin: "Shanghai", destination: "Laem Chabang", pol: "CNSHA", pod: "THLCH" };
      await db.insert(jobs).values([
        { id: jobA, jobNumber: `TEST-FA-${stamp}`, customerId: "c1", ...base },
        { id: jobB, jobNumber: `TEST-FB-${stamp}`, customerId: "c2", ...base },
      ]);

      /* bookings */
      const bad = await call("POST", "/api/bookings", { customerId: "c1", pol: "", pod: "THLCH", etd: "2026-10-10", eta: "2026-10-01" });
      assert.equal(bad.status, 400);
      const badPaths = ((await bad.json()) as { issues: { path: string }[] }).issues.map((i) => i.path);
      assert.ok(badPaths.includes("pol"));

      assert.equal((await call("POST", "/api/bookings", { customerId: "nope", pol: "CNSHA", pod: "THLCH" })).status, 404);
      const mismatch = await call("POST", "/api/bookings", { customerId: "c1", pol: "CNSHA", pod: "THLCH", jobIds: [jobB] });
      assert.equal(mismatch.status, 400);

      const si = "2026-10-05T10:00:00.000Z";
      const res = await call("POST", "/api/bookings", {
        customerId: "c1",
        pol: "cnsha",
        pod: "THLCH",
        carrier: "COSCO",
        vessel: "TEST VESSEL",
        etd: "2026-10-08",
        eta: "2026-10-15",
        teu: 4,
        siCutoff: si,
        jobIds: [jobA],
      });
      assert.equal(res.status, 201);
      const b = (await res.json()) as Booking;
      made.bookings.push(b.id);
      assert.match(b.bookingNumber, /^BK-\d{4}-\d+$/);
      assert.equal(b.stage, "booking");
      assert.deepEqual(b.jobs.map((j) => j.id), [jobA]);
      const [linked] = await db.select().from(jobs).where(eq(jobs.id, jobA));
      assert.equal(linked!.bookingId, b.id);
      assert.equal(linked!.siCutoff?.toISOString(), si);

      // stage + cut-offs persist; cut-offs flow to the linked job
      const cy = "2026-10-07T05:00:00.000Z";
      const patched = await call("PATCH", `/api/bookings/${b.id}`, { stage: "gate_in", cyCutoff: cy, siCutoff: null });
      assert.equal(patched.status, 200);
      const again = (await (await call("GET", `/api/bookings/${b.id}`)).json()) as Booking;
      assert.equal(again.stage, "gate_in");
      assert.equal(again.cyCutoff, cy);
      assert.equal(again.siCutoff, null);
      const [synced] = await db.select().from(jobs).where(eq(jobs.id, jobA));
      assert.equal(synced!.cyCutoff?.toISOString(), cy);
      assert.equal(synced!.siCutoff, null);
      assert.equal((await call("PATCH", `/api/bookings/${b.id}`, { stage: "flying" })).status, 400);
      assert.equal((await call("PATCH", "/api/bookings/does-not-exist", { stage: "sail" })).status, 404);

      const list = (await (await call("GET", `/api/bookings?jobId=${jobA}`)).json()) as { items: Booking[] };
      assert.deepEqual(list.items.map((x) => x.id), [b.id]);

      // link / unlink
      assert.equal((await call("POST", `/api/bookings/${b.id}/jobs`, { jobId: jobB })).status, 400);
      assert.equal((await call("DELETE", `/api/bookings/${b.id}/jobs/${jobA}`)).status, 200);
      const [unlinked] = await db.select().from(jobs).where(eq(jobs.id, jobA));
      assert.equal(unlinked!.bookingId, null);
      const relinked = (await (await call("POST", `/api/bookings/${b.id}/jobs`, { jobId: jobA })).json()) as Booking;
      assert.deepEqual(relinked.jobs.map((j) => j.id), [jobA]);

      /* job cut-offs */
      const vgm = "2026-10-06T08:00:00.000Z";
      const jc = await call("PATCH", `/api/jobs/${jobA}/cutoffs`, { vgmCutoff: vgm });
      assert.equal(jc.status, 200);
      assert.equal(((await jc.json()) as { vgmCutoff: string }).vgmCutoff, vgm);
      assert.equal((await call("PATCH", `/api/jobs/${jobA}/cutoffs`, { vgmCutoff: "not a date" })).status, 400);
      assert.equal((await call("PATCH", "/api/jobs/does-not-exist/cutoffs", { vgmCutoff: vgm })).status, 404);

      /* containers: real last free day */
      const [box] = await db.select({ id: containers.id, lastFreeDay: containers.lastFreeDay, freeDays: containers.freeDays }).from(containers).where(eq(containers.organizationId, DEMO_ORG_ID)).limit(1);
      if (box) {
        boxBefore = { id: box.id, lastFreeDay: box.lastFreeDay ? String(box.lastFreeDay) : null, freeDays: box.freeDays };
        const cp = await call("PATCH", `/api/containers/${box.id}`, { lastFreeDay: "2026-10-20", freeDays: 9 });
        assert.equal(cp.status, 200);
        const cb = (await cp.json()) as { lastFreeDay: string; freeDays: number };
        assert.equal(cb.lastFreeDay, "2026-10-20");
        assert.equal(cb.freeDays, 9);
        assert.equal((await call("PATCH", `/api/containers/${box.id}`, { lastFreeDay: "20/10/2026" })).status, 400);
      }

      /* deals: currency + owner */
      const badOwner = await call("POST", "/api/opportunities", { customerId: "c1", title: "TEST deal", ownerUserId: "00000000-0000-4000-8000-000000000000" });
      assert.equal(badOwner.status, 400);
      assert.equal((await call("POST", "/api/opportunities", { customerId: "nope", title: "TEST deal" })).status, 404);
      const dRes = await call("POST", "/api/opportunities", { customerId: "c1", title: "TEST deal (fields.test)", value: 1200, currency: "usd", ownerUserId: sales.id });
      assert.equal(dRes.status, 201);
      const deal = (await dRes.json()) as { id: string; currency: string; owner: string; ownerUserId: string };
      made.deals.push(deal.id);
      assert.equal(deal.currency, "USD");
      assert.equal(deal.ownerUserId, sales.id);
      assert.equal(deal.owner, "周可");
      const dDefault = (await (await call("POST", "/api/opportunities", { customerId: "c1", title: "TEST deal THB (fields.test)", value: 5 })).json()) as { id: string; currency: string };
      made.deals.push(dDefault.id);
      assert.equal(dDefault.currency, "THB");
      const dp = (await (await call("PATCH", `/api/opportunities/${deal.id}`, { stage: "won", ownerUserId: admin.id })).json()) as { stage: string; owner: string };
      assert.equal(dp.stage, "won");
      assert.equal(dp.owner, "林晓衡");
      const dl = (await (await call("GET", "/api/opportunities")).json()) as { totals: Record<string, number> };
      assert.ok((dl.totals.USD ?? 0) >= 1200);

      /* leads: owner */
      const lRes = await call("POST", "/api/leads", { company: "TEST lead (fields.test)", ownerUserId: sales.id });
      assert.equal(lRes.status, 201);
      const lead = (await lRes.json()) as { id: string; owner: string; ownerUserId: string };
      made.leads.push(lead.id);
      assert.equal(lead.owner, "周可");
      const lp = (await (await call("PATCH", `/api/leads/${lead.id}`, { ownerUserId: admin.id, stage: "working" })).json()) as { ownerUserId: string; stage: string };
      assert.equal(lp.ownerUserId, admin.id);
      assert.equal(lp.stage, "working");
      assert.equal((await call("PATCH", `/api/leads/${lead.id}`, { stage: "nope" })).status, 400);

      /* quotation list carries totals */
      const ql = (await (await call("GET", "/api/quotations")).json()) as { items: { totalSell: string | null; totalsByCurrency: Record<string, string>; chargeCount: number }[] };
      assert.ok(ql.items.every((q) => "totalSell" in q && typeof q.chargeCount === "number"));
      assert.ok(ql.items.some((q) => q.totalSell !== null));
    } catch (e) {
      const down = isDbDown(e);
      if (down) return t.skip(`database unavailable: ${down}`);
      throw e;
    } finally {
      await db.update(jobs).set({ bookingId: null }).where(eq(jobs.id, jobA)).catch(() => {});
      for (const id of made.bookings) await db.delete(bookings).where(eq(bookings.id, id)).catch(() => {});
      await db.delete(jobs).where(eq(jobs.id, jobA)).catch(() => {});
      await db.delete(jobs).where(eq(jobs.id, jobB)).catch(() => {});
      for (const id of made.deals) await db.delete(opportunities).where(eq(opportunities.id, id)).catch(() => {});
      for (const id of made.leads) await db.delete(leads).where(eq(leads.id, id)).catch(() => {});
      if (boxBefore) await db.update(containers).set({ lastFreeDay: boxBefore.lastFreeDay, freeDays: boxBefore.freeDays }).where(eq(containers.id, boxBefore.id)).catch(() => {});
      await closeDb();
    }
  });
});
