import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { toCsv } from "./bulk.service.js";
import { parseJobListQuery } from "./job-list.service.js";
import { parseInvoiceListQuery, wantsPagedInvoices } from "./invoice-list.service.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
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

describe("CSV export", () => {
  it("adds a BOM, quotes commas / quotes / newlines and neutralizes formulas but not negative numbers", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["=SUM(A1)", "-12.5"], ["line\nbreak", null]]);
    assert.ok(csv.startsWith("﻿"));
    const lines = csv.slice(1).split("\r\n");
    assert.equal(lines[0], "a,b");
    assert.equal(lines[1], '"x,y","say ""hi"""');
    assert.equal(lines[2], "'=SUM(A1),-12.5");
    assert.equal(lines[3], '"line\nbreak",');
  });
});

describe("list query parsing", () => {
  it("clamps paging and ignores unknown filter values", () => {
    const q = parseJobListQuery((k) => ({ limit: "99999", offset: "-5", status: "NOPE", stage: "sailed", view: "board", perStage: "500" })[k]);
    assert.equal(q.limit, 500);
    assert.equal(q.offset, 0);
    assert.equal(q.status, undefined);
    assert.equal(q.stage, "sailed");
    assert.equal(q.sort, "board");
    assert.equal(q.perStage, 100);
    const i = parseInvoiceListQuery((k) => ({ view: "overdue", group: "bogus" })[k]);
    assert.equal(i.view, "overdue");
    assert.equal(i.group, undefined);
    assert.equal(wantsPagedInvoices(() => undefined), false);
    assert.equal(wantsPagedInvoices((k) => (k === "limit" ? "50" : undefined)), true);
  });
});

describe("server-side lists + bulk actions (HTTP, local DB)", () => {
  it("pages / counts jobs and invoices in SQL, bulk-updates jobs with permission + org checks", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-scale";
    const { getDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { jobs } = await import("../db/schema/operations.js");
    const { and, eq, inArray } = await import("drizzle-orm");
    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const who = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
    const admin = await who("admin@cangzhan.com");
    const finance = await who("finance@cangzhan.com");
    if (!admin || !finance) return t.skip("no seed users — run db:seed");
    const tok = (id: string, email: string) => signSession({ sub: id, email, roles: [], permissions: [], orgId: DEMO_ORG_ID });
    const adminTok = await tok(admin.id, "admin@cangzhan.com");
    const finTok = await tok(finance.id, "finance@cangzhan.com");
    const call = (method: string, path: string, body?: unknown, token = adminTok) =>
      app.request(`http://localhost${path}`, {
        method,
        headers: { Cookie: `${COOKIE}=${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    // Jobs list: counts per tab add up, stage filter matches stageCounts, paging is honoured.
    const all = (await (await call("GET", "/api/jobs?limit=2")).json()) as {
      items: { id: string; stage: number }[];
      total: number;
      counts: Record<string, number>;
      stageCounts: Record<string, number>;
    };
    assert.ok(all.items.length <= 2);
    assert.equal(all.counts.all, all.total);
    assert.equal(all.counts.OPEN + all.counts.IN_PROGRESS + all.counts.CLOSED, all.counts.all);
    assert.equal(Object.values(all.stageCounts).reduce((a, b) => a + b, 0), all.total);
    const sailed = (await (await call("GET", "/api/jobs?stage=sailed&limit=500")).json()) as { items: { stage: number }[]; total: number };
    assert.equal(sailed.total, all.stageCounts.sailed);
    assert.ok(sailed.items.every((j) => j.stage === 2));
    const board = (await (await call("GET", "/api/jobs?view=board&perStage=1")).json()) as { items: { stage: number }[] };
    assert.ok(board.items.length <= 6);

    // Invoices paged mode vs legacy mode.
    const inv = (await (await call("GET", "/api/invoices?limit=3")).json()) as { items: unknown[]; counts: Record<string, number>; summary: unknown };
    assert.ok(inv.items.length <= 3 && inv.summary && typeof inv.counts.overdue === "number");
    const legacy = (await (await call("GET", "/api/invoices")).json()) as { items: Record<string, unknown>[]; counts?: unknown };
    assert.equal(legacy.counts, undefined);
    assert.ok(legacy.items.every((i) => !("snapshot" in i)));

    // Bulk status: permission, validation, foreign ids, then a real update (restored afterwards).
    const ids = all.items.map((j) => j.id).slice(0, 2);
    if (!ids.length) return t.skip("no demo jobs");
    const before = await db.select({ id: jobs.id, status: jobs.status }).from(jobs).where(inArray(jobs.id, ids));
    try {
      assert.equal((await call("POST", "/api/bulk/jobs", { ids, action: "status", status: "SAIL" }, finTok)).status, 403);
      assert.equal((await call("POST", "/api/bulk/jobs", { ids: [], action: "status", status: "SAIL" })).status, 400);
      assert.equal((await call("POST", "/api/bulk/jobs", { ids: [...ids, "no-such-job"], action: "status", status: "SAIL" })).status, 404);
      assert.equal((await call("POST", "/api/bulk/jobs", { ids, action: "owner", field: "ops", userId: "00000000-0000-4000-8000-000000000000" })).status, 404);
      const ok = await call("POST", "/api/bulk/jobs", { ids, action: "status", status: "ARRIVED" });
      assert.equal(ok.status, 200);
      const after = await db.select({ status: jobs.status }).from(jobs).where(and(eq(jobs.organizationId, DEMO_ORG_ID), inArray(jobs.id, ids)));
      assert.ok(after.every((r) => r.status === "ARRIVED"));

      const csv = await call("GET", `/api/exports/jobs.csv?ids=${ids.join(",")}`);
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
      assert.equal((await csv.text()).trim().split("\r\n").length, ids.length + 1);
    } finally {
      for (const b of before) await db.update(jobs).set({ status: b.status }).where(eq(jobs.id, b.id));
    }
  });
});
