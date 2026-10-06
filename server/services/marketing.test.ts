import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { hasPermission } from "../domain/rbac.js";
import {
  csvCell,
  growthMonths,
  normalizeSource,
  parseSegmentFilter,
  rangeBounds,
  resolveRange,
  toCsv,
} from "./marketing.service.js";

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

describe("marketing ranges", () => {
  // 2026-08-15 10:00 Bangkok
  const now = new Date("2026-08-15T03:00:00Z");
  it("resolves month / quarter / year to Bangkok calendar days up to today", () => {
    assert.deepEqual(resolveRange({}, now), { period: "month", from: "2026-08-01", to: "2026-08-15" });
    assert.deepEqual(resolveRange({ period: "quarter" }, now), { period: "quarter", from: "2026-07-01", to: "2026-08-15" });
    assert.deepEqual(resolveRange({ period: "year" }, now), { period: "year", from: "2026-01-01", to: "2026-08-15" });
  });
  it("uses Bangkok time at the month boundary", () => {
    // 2026-08-31 18:00 UTC is already 1 September in Bangkok.
    assert.deepEqual(resolveRange({}, new Date("2026-08-31T18:00:00Z")), { period: "month", from: "2026-09-01", to: "2026-09-01" });
  });
  it("accepts a custom range, swaps reversed dates, ignores junk", () => {
    assert.deepEqual(resolveRange({ from: "2026-03-10", to: "2026-02-01" }, now), { period: "custom", from: "2026-02-01", to: "2026-03-10" });
    assert.equal(resolveRange({ from: "2026-13-99", to: "x" }, now).period, "month");
    assert.equal(resolveRange({ from: "1990-01-01", to: "2026-01-01" }, now).from > "2022-01-01", true, "custom ranges are capped");
  });
  it("bounds are [from 00:00+07, to+1 00:00+07)", () => {
    assert.deepEqual(rangeBounds({ from: "2026-08-01", to: "2026-08-15" }), {
      start: "2026-07-31T17:00:00.000Z",
      end: "2026-08-15T17:00:00.000Z",
    });
  });
  it("growth covers at least 6 months and at most 24", () => {
    assert.deepEqual(growthMonths({ from: "2026-08-01", to: "2026-08-15" }), ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    assert.equal(growthMonths({ from: "2026-01-01", to: "2026-12-31" }).length, 12);
    assert.equal(growthMonths({ from: "2020-01-01", to: "2026-12-31" }).length, 24);
    assert.deepEqual(growthMonths({ from: "2025-11-20", to: "2026-01-10" }).slice(-3), ["2025-11", "2025-12", "2026-01"]);
  });
});

describe("lead source normalisation", () => {
  it("folds zh / th / en spellings into one key", () => {
    for (const [raw, key] of [
      ["งานแสดงสินค้า", "exhibition"],
      ["展会", "exhibition"],
      ["Trade show", "exhibition"],
      ["แนะนำต่อ", "referral"],
      ["转介", "referral"],
      ["เว็บไซต์", "website"],
      ["官网", "website"],
      ["LINE OA", "line"],
      ["Facebook", "facebook"],
      ["FB ads", "facebook"],
      ["โทรเข้า", "phone"],
      ["cold call", "cold_call"],
      ["邮件", "email"],
      ["协会", "association"],
      ["online ads", "other"],
      ["", "other"],
    ] as const) {
      assert.equal(normalizeSource(raw), key, raw);
    }
  });
});

describe("segment filter + CSV", () => {
  it("parses only known values", () => {
    assert.deepEqual(parseSegmentFilter({ pol: "thlch", pod: "bad code!", recency: "d30", size: "huge", owner: " n:Alice ", businessType: "" }), {
      pol: "THLCH",
      pod: undefined,
      businessType: undefined,
      industry: undefined,
      owner: "n:Alice",
      recency: "d30",
      size: undefined,
      q: undefined,
    });
  });
  it("quotes cells, keeps phone numbers, neutralises formulas", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
    assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
    assert.equal(csvCell("+66 2 754 3301"), "+66 2 754 3301");
    assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell(null), "");
    const csv = toCsv([["ชื่อ", "อีเมล"], ["สมชาย", "a@b.co"]]);
    assert.ok(csv.startsWith("\uFEFFชื่อ,อีเมล\r\n"));
    assert.ok(csv.endsWith("สมชาย,a@b.co\r\n"));
  });
});

describe("marketing APIs: access", () => {
  it("needs sign-in", async () => {
    for (const p of ["/api/marketing/overview", "/api/marketing/at-risk", "/api/marketing/segments", "/api/marketing/segments/contacts.csv"]) {
      const res = await app.request(`http://localhost${p}`);
      assert.equal(res.status, 401, p);
    }
  });
  it("marketing, sales and management can see it; operations and finance cannot", () => {
    for (const r of ["MARKETING", "SALES", "MANAGEMENT", "SUPER_ADMIN"] as const) assert.equal(hasPermission([r], "report.marketing.view"), true, r);
    for (const r of ["OPERATIONS", "ACCOUNTING", "VIEWER"] as const) assert.equal(hasPermission([r], "report.marketing.view"), false, r);
  });
});

describe("marketing aggregates (local DB, isolated org)", () => {
  it("counts the funnel, sources, pipeline, quotations, growth, at-risk and segments for one org only", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-marketing";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { organizations } = await import("../db/schema/tenancy.js");
    const { contacts, customers, leads, opportunities } = await import("../db/schema/crm.js");
    const { quotations } = await import("../db/schema/commercial.js");
    const { jobs } = await import("../db/schema/operations.js");
    const { tasks } = await import("../db/schema/tasks.js");
    const { users } = await import("../db/schema/auth.js");
    const { eq } = await import("drizzle-orm");
    const svc = await import("./marketing.service.js");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const tag = `mkt${Date.now()}`;
    let orgId: string | null = null;
    try {
      const [org] = await db.insert(organizations).values({ slug: `test-${tag}`, name: `Test ${tag}` }).returning({ id: organizations.id });
      orgId = org!.id;
      const DAY = 86_400_000;
      const ago = (d: number) => new Date(Date.now() - d * DAY);
      const cust = (id: string, extra: Partial<typeof customers.$inferInsert> = {}) => ({
        id: `${tag}-${id}`,
        organizationId: orgId!,
        nameZh: `${id}zh`,
        nameTh: `${id}th`,
        nameEn: `${id}en`,
        cityZh: "",
        cityTh: "",
        cityEn: "",
        laneZh: "",
        laneTh: "",
        laneEn: "",
        owner: "Alice",
        updated: "01-01",
        ...extra,
      });
      await db.insert(customers).values([
        cust("a", { businessType: "exporter", industry: "Rubber", createdAt: ago(10) }),
        cust("b", { businessType: "importer", owner: "Bob", createdAt: ago(20) }),
        cust("old", { businessType: "exporter", createdAt: ago(400) }), // quiet for > 90 days → at risk
        cust("idle", { createdAt: ago(5) }), // new, nothing yet → not at risk
      ]);
      await db.insert(contacts).values([
        { id: `${tag}-p1`, customerId: `${tag}-a`, name: "=cmd", email: "a@x.co", phone: "+66 1", primary: true },
        { id: `${tag}-p2`, customerId: `${tag}-a`, name: "A2", email: "", phone: "" }, // unreachable: not exported
        { id: `${tag}-p3`, customerId: `${tag}-old`, name: "Old", email: "old@x.co", phone: "" },
      ]);
      const lead = (n: number, source: string, stage: string, days: number) => ({
        id: `${tag}-l${n}`,
        organizationId: orgId!,
        company: `L${n}`,
        city: "",
        lane: "",
        contact: "",
        source,
        stage,
        owner: "Alice",
        updated: "01-01",
        createdAt: ago(days),
      });
      await db.insert(leads).values([
        lead(1, "งานแสดงสินค้า", "qualified", 3),
        lead(2, "展会", "new", 4),
        lead(3, "แนะนำต่อ", "qualified", 5),
        lead(4, "LINE OA", "lost", 6),
        lead(5, "เว็บไซต์", "new", 200), // outside the range
      ]);
      const quote = (n: number, customer: string, status: string, createdDays: number, sentDays: number | null, pol = "THLCH", pod = "CNSHA") => ({
        id: `${tag}-q${n}`,
        organizationId: orgId!,
        quotationNumber: `${tag}-Q${n}`,
        customerId: `${tag}-${customer}`,
        mode: "SEA_FCL",
        origin: "",
        destination: "",
        pol,
        pod,
        status,
        createdAt: ago(createdDays),
        updatedAt: ago(Math.max(0, createdDays - 4)),
        sentAt: sentDays === null ? null : ago(sentDays),
      });
      await db.insert(quotations).values([
        quote(1, "a", "ACCEPTED", 9, 8),
        quote(2, "a", "SENT", 4, 3),
        quote(3, "b", "REJECTED", 12, 11),
        quote(4, "b", "EXPIRED", 15, 14, "CNNGB", "THBKK"),
        quote(5, "b", "DRAFT", 2, null),
        quote(6, "old", "ACCEPTED", 300, 299), // outside the range, and > 90 days ago
      ]);
      await db.insert(jobs).values([
        { id: `${tag}-j1`, organizationId: orgId!, jobNumber: `${tag}-J1`, customerId: `${tag}-a`, quotationId: `${tag}-q1`, mode: "SEA_FCL", origin: "", destination: "", pol: "THLCH", pod: "CNSHA", createdAt: ago(5) },
        { id: `${tag}-j2`, organizationId: orgId!, jobNumber: `${tag}-J2`, customerId: `${tag}-old`, quotationId: `${tag}-q6`, mode: "SEA_FCL", origin: "", destination: "", pol: "THLCH", pod: "CNSHA", createdAt: ago(290) },
      ]);
      await db.insert(opportunities).values([
        { id: `${tag}-d1`, customerId: `${tag}-a`, title: "d1", lane: "", stage: "quote", value: 1000, close: "01-01", owner: "Alice", currency: "THB" },
        { id: `${tag}-d2`, customerId: `${tag}-b`, title: "d2", lane: "", stage: "qualify", value: 500, close: "01-01", owner: "Bob", currency: "USD" },
        { id: `${tag}-d3`, customerId: `${tag}-b`, title: "d3", lane: "", stage: "won", value: 700, close: "01-01", owner: "Bob", currency: "THB" },
      ]);

      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
      const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(ago(60));
      const ov = await svc.marketingOverview(db, orgId, { period: "custom", from, to: today });

      assert.deepEqual(
        ov.funnel.map((f) => [f.key, f.count]),
        [["leads", 4], ["qualified", 2], ["sent", 4], ["accepted", 1], ["jobs", 1]],
      );
      assert.equal(ov.funnel[1]!.rate, 50);
      assert.equal(ov.leads.conversion, 50);
      const src = Object.fromEntries(ov.sources.map((s) => [s.key, [s.leads, s.won, s.wonRate]]));
      assert.deepEqual(src, { exhibition: [2, 1, 50], referral: [1, 1, 100], line: [1, 0, 0] });

      assert.equal(ov.quotations.sent, 4);
      assert.equal(ov.quotations.accepted, 1);
      assert.equal(ov.quotations.rejected, 1);
      assert.equal(ov.quotations.expired, 1);
      assert.equal(ov.quotations.waiting, 1);
      assert.equal(ov.quotations.acceptanceRate, 25);
      assert.equal(ov.quotations.winRate, 33.3);
      assert.equal(ov.quotations.avgDaysToClose, 4);
      assert.deepEqual(ov.quotations.topLanes[0], { pol: "THLCH", pod: "CNSHA", quotes: 4, accepted: 1 });

      assert.equal(ov.pipeline.openDeals, 2);
      assert.deepEqual(ov.pipeline.open, [{ currency: "THB", value: 1000 }, { currency: "USD", value: 500 }]);
      assert.deepEqual(ov.pipeline.byStage.find((s) => s.stage === "won"), { stage: "won", deals: 1, values: [{ currency: "THB", value: 700 }] });
      const bob = ov.pipeline.byOwner.find((o) => o.owner.key === "n:Bob")!;
      assert.equal(bob.openDeals, 1);
      assert.equal(bob.wonDeals, 1);
      assert.equal(bob.owner.name, "Bob");

      assert.equal(ov.customers.newCount, 3);
      assert.equal(ov.customers.active, 1);
      assert.equal(ov.customers.atRisk, 1);
      assert.equal(ov.customers.growth.reduce((n, g) => n + g.count, 0), 3);
      assert.ok(ov.customers.growth.length >= 6);

      const risk = await svc.listAtRisk(db, orgId);
      assert.deepEqual(risk.items.map((r) => r.id), [`${tag}-old`]);
      assert.ok((risk.items[0]!.daysSince ?? 0) >= 289);
      assert.equal(risk.items[0]!.contact?.email, "old@x.co");

      // Segments
      const all = await svc.segmentCustomers(db, orgId, {});
      assert.equal(all.total, 4);
      assert.equal(all.reachable, 2);
      const exporters = await svc.segmentCustomers(db, orgId, { businessType: "exporter" });
      assert.deepEqual(exporters.items.map((i) => i.id).sort(), [`${tag}-a`, `${tag}-old`]);
      assert.equal((await svc.segmentCustomers(db, orgId, { pod: "THBKK" })).total, 1);
      assert.equal((await svc.segmentCustomers(db, orgId, { pol: "THLCH", recency: "d30" })).total, 2);
      assert.equal((await svc.segmentCustomers(db, orgId, { recency: "dormant" })).total, 1);
      assert.equal((await svc.segmentCustomers(db, orgId, { recency: "never" })).total, 1);
      assert.equal((await svc.segmentCustomers(db, orgId, { size: "none" })).total, 2);
      assert.equal((await svc.segmentCustomers(db, orgId, { size: "small" })).total, 2);
      assert.equal((await svc.segmentCustomers(db, orgId, { owner: "n:Bob" })).total, 1);
      assert.equal((await svc.segmentCustomers(db, orgId, { industry: "rubber" })).total, 1);
      const opts = await svc.segmentOptions(db, orgId);
      assert.deepEqual(opts.businessTypes.sort(), ["exporter", "importer"]);
      assert.deepEqual(opts.owners.map((o) => o.key).sort(), ["n:Alice", "n:Bob"]);
      assert.ok(opts.pols.includes("THLCH") && opts.pods.includes("THBKK"));

      const { csv, count } = await svc.segmentContactsCsv(db, orgId, { businessType: "exporter" }, "en");
      assert.equal(count, 2);
      const lines = csv.replace(/^\uFEFF/, "").trim().split("\r\n");
      assert.equal(lines[0], "Name,Email,Phone,Company,Title,LINE,Owner");
      assert.ok(lines.includes("'=cmd,a@x.co,+66 1,aen,,,Alice"), lines.join(" | "));
      assert.ok(lines.includes("Old,old@x.co,,olden,,,Alice"));

      // HTTP: org-scoped via the session, CSV download headers, permission gate.
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      if (admin) {
        const tok = (role: string) => signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: [role], permissions: [], orgId: orgId! });
        const call = async (role: string, path: string) =>
          app.request(`http://localhost${path}`, { headers: { Cookie: `${COOKIE}=${await tok(role)}` } });
        // The admin is not a member of the throwaway org: the tenant gate refuses it.
        assert.equal((await call("SUPER_ADMIN", "/api/marketing/overview")).status, 403);
      }
    } catch (e) {
      const down = isDbDown(e);
      if (down) return t.skip(`database unavailable: ${down}`);
      throw e;
    } finally {
      if (orgId) {
        const { inArray, like } = await import("drizzle-orm");
        await db.delete(tasks).where(eq(tasks.organizationId, orgId)).catch(() => undefined);
        await db.delete(jobs).where(eq(jobs.organizationId, orgId)).catch(() => undefined);
        await db.delete(quotations).where(eq(quotations.organizationId, orgId)).catch(() => undefined);
        await db.delete(opportunities).where(like(opportunities.id, `${tag}-%`)).catch(() => undefined);
        await db.delete(contacts).where(like(contacts.id, `${tag}-%`)).catch(() => undefined);
        await db.delete(customers).where(eq(customers.organizationId, orgId)).catch(() => undefined);
        await db.delete(leads).where(eq(leads.organizationId, orgId)).catch(() => undefined);
        const { auditLogs } = await import("../db/schema/auth.js");
        await db.delete(auditLogs).where(inArray(auditLogs.organizationId, [orgId])).catch(() => undefined);
        await db.delete(organizations).where(eq(organizations.id, orgId)).catch(() => undefined);
      }
      await closeDb();
    }
  });

  it("serves the demo org over HTTP with a CSV download", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-marketing";
    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users, auditLogs } = await import("../db/schema/auth.js");
    const { and, eq, gte } = await import("drizzle-orm");
    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const started = new Date();
    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      if (!admin) return t.skip("no seed users — run db:seed");
      const [ops] = await db.select({ id: users.id }).from(users).where(eq(users.email, "ops@cangzhan.com")).limit(1);
      // Roles are read from the database for the signed-in user, so use the real ops account for the 403.
      const call = async (role: string, path: string) =>
        app.request(`http://localhost${path}`, {
          headers: {
            Cookie: `${COOKIE}=${await signSession(
              role === "OPERATIONS" && ops
                ? { sub: ops.id, email: "ops@cangzhan.com", roles: [role], permissions: [], orgId: DEMO_ORG_ID }
                : { sub: admin.id, email: "admin@cangzhan.com", roles: [role], permissions: [], orgId: DEMO_ORG_ID },
            )}`,
          },
        });
      if (ops) assert.equal((await call("OPERATIONS", "/api/marketing/overview")).status, 403);
      const ov = await call("SUPER_ADMIN", "/api/marketing/overview?period=quarter");
      assert.equal(ov.status, 200);
      const body = (await ov.json()) as { range: { period: string }; funnel: unknown[] };
      assert.equal(body.range.period, "quarter");
      assert.equal(body.funnel.length, 5);
      const csv = await call("SUPER_ADMIN", "/api/marketing/segments/contacts.csv?lang=en&recency=d30");
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
      assert.match(csv.headers.get("content-disposition") ?? "", /attachment; filename="segment-contacts-/);
      const bytes = new Uint8Array(await csv.arrayBuffer());
      assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM for Excel");
      assert.ok(new TextDecoder().decode(bytes).startsWith("Name,Email,Phone,Company"));
      const audits = await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, "marketing.segment_export"), gte(auditLogs.createdAt, started)));
      assert.ok(audits.length >= 1, "CSV export is audited");
      for (const a of audits) await db.delete(auditLogs).where(eq(auditLogs.id, a.id));
    } catch (e) {
      const down = isDbDown(e);
      if (down) return t.skip(`database unavailable: ${down}`);
      throw e;
    } finally {
      await closeDb();
    }
  });
});
