import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { RULE_KEYS, evaluateRules, expandCandidates, lineText, runAutomation, type RuleKey, type Snapshot } from "./automation.service.js";
import { verifyLineSignature } from "./line.service.js";
import { extractLinkCode, generateLinkCode } from "./notifications.service.js";

const OPS = "00000000-0000-4000-8000-000000000001";
const SALES = "00000000-0000-4000-8000-000000000002";
const FIN = "00000000-0000-4000-8000-000000000003";
const ADMIN = "00000000-0000-4000-8000-000000000004";
const OWNER = "00000000-0000-4000-8000-000000000005";
const ORG = "11111111-1111-4111-8111-111111111111";

/** "Today" is 2026-09-28 in Bangkok. */
const NOW = new Date("2026-09-28T05:00:00Z");

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    now: NOW,
    timezone: "Asia/Bangkok",
    members: [
      { id: OPS, roles: ["OPERATIONS"], orgRole: "member" },
      { id: SALES, roles: ["SALES"], orgRole: "member" },
      { id: FIN, roles: ["ACCOUNTING"], orgRole: "member" },
      { id: ADMIN, roles: ["SUPER_ADMIN"], orgRole: "owner" },
      { id: OWNER, roles: ["SALES"], orgRole: "member" },
    ],
    customers: [{ id: "c1", ownerUserId: OWNER, nameTh: "ลูกค้า", nameEn: "Customer" }],
    jobs: [],
    containers: [],
    docs: [],
    invoices: [],
    quotations: [],
    ...over,
  };
}

const ALL = new Set<RuleKey>(RULE_KEYS);
const job = (over: Record<string, unknown> = {}) => ({
  id: "j1",
  jobNumber: "JOB-1",
  customerId: "c1",
  status: "SAIL",
  etd: "2026-09-18",
  eta: "2026-09-25",
  salesOwnerId: SALES,
  assignedOperator: OPS,
  ...over,
});

describe("automation rules — evaluation", () => {
  it("job delayed: ETA passed and not arrived → job owners; arrived jobs are ignored", () => {
    const ev = evaluateRules(
      snap({ jobs: [job(), job({ id: "j2", jobNumber: "JOB-2", status: "ARRIVED" }), job({ id: "j3", eta: "2026-10-02" })] }),
      ALL,
    );
    const hits = ev.candidates.filter((c) => c.rule === "job_delayed");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.refId, "j1");
    assert.deepEqual(hits[0]!.userIds.sort(), [OPS, SALES, OWNER].sort());
    assert.equal(hits[0]!.params.days, 3);
    assert.equal(hits[0]!.href, "/jobs/j1");
  });

  it("ETA changed: first run records a baseline, later change notifies once per change", () => {
    const first = evaluateRules(snap({ jobs: [job({ eta: "2026-10-05" })] }), ALL);
    assert.equal(first.candidates.filter((c) => c.rule === "eta_changed").length, 0);
    assert.deepEqual(first.nextState.eta_changed, { eta: { j1: "2026-10-05" } });

    const second = evaluateRules(snap({ jobs: [job({ eta: "2026-10-08" })] }), ALL, first.nextState);
    const hit = second.candidates.find((c) => c.rule === "eta_changed");
    assert.ok(hit);
    assert.equal(hit.dedupeKey, "eta_changed:j1:2026-10-05>2026-10-08");
    assert.equal(hit.params.days, 3);

    const same = evaluateRules(snap({ jobs: [job({ eta: "2026-10-08" })] }), ALL, second.nextState);
    assert.equal(same.candidates.filter((c) => c.rule === "eta_changed").length, 0);
  });

  it("documents: late always; waiting only when the shipment moves within 3 days", () => {
    const s = snap({
      jobs: [
        job({ id: "soon", etd: "2026-09-30", eta: "2026-10-07", status: "BOOKING" }),
        job({ id: "later", etd: "2026-10-20", eta: "2026-10-27", status: "BOOKING" }),
      ],
      containers: [
        { id: "b1", containerNo: "AAAU1", jobId: "soon", customerId: "c1", status: "yard", direction: "out", eta: null },
        { id: "b2", containerNo: "AAAU2", jobId: "later", customerId: "c1", status: "yard", direction: "out", eta: null },
      ],
      docs: [
        { id: "d1", customerId: "c1", boxId: "AAAU1", kind: "CO", name: "C/O 1", status: "wait" },
        { id: "d2", customerId: "c1", boxId: "AAAU2", kind: "CO", name: "C/O 2", status: "wait" },
        { id: "d3", customerId: "c1", boxId: "AAAU2", kind: "BL", name: "B/L 2", status: "late" },
        { id: "d4", customerId: "c1", boxId: "", kind: "CI", name: "CI", status: "late" },
      ],
    });
    const hits = evaluateRules(s, ALL).candidates.filter((c) => c.rule === "doc_missing");
    assert.deepEqual(hits.map((h) => h.refId).sort(), ["d1", "d3", "d4"]);
    assert.deepEqual(hits.find((h) => h.refId === "d4")!.userIds, [OWNER], "no job → customer owner");
  });

  it("free time: inbound laden boxes with ≤ 3 days left (soon) or overdue (over); empties ignored", () => {
    const box = (id: string, eta: string, status = "yard", direction = "in") => ({
      id,
      containerNo: id.toUpperCase(),
      jobId: "j1",
      customerId: "c1",
      status,
      direction,
      eta,
    });
    const s = snap({
      jobs: [job({ status: "ARRIVED" })],
      containers: [
        box("a", "2026-09-26"),
        box("b", "2026-09-20"),
        box("c", "2026-09-27", "empty"),
        box("d", "2026-09-27", "yard", "out"),
        box("e", "2026-09-20", "sail"),
        box("f", "2026-09-28"),
      ],
    });
    const hits = evaluateRules(s, ALL).candidates.filter((c) => c.rule === "free_time");
    const byId = Object.fromEntries(hits.map((h) => [h.refId, h]));
    assert.deepEqual(Object.keys(byId).sort(), ["a", "b"]);
    assert.equal(byId.a!.params.days, 3);
    assert.equal(byId.a!.params.stage, "soon");
    assert.equal(byId.b!.params.stage, "over");
    assert.equal(byId.b!.dedupeKey, "free_time:b:2026-09-25:over");
  });

  it("invoice overdue → finance + customer owner; drafts, paid and not-yet-due are ignored", () => {
    const inv = (id: string, status: string, due: string, bal = "100") => ({
      id,
      invoiceNumber: id.toUpperCase(),
      customerId: "c1",
      jobId: null,
      status,
      dueDate: new Date(due),
      balanceDue: bal,
      currency: "THB",
    });
    const s = snap({
      invoices: [
        inv("i1", "ISSUED", "2026-09-20T00:00:00+07:00"),
        inv("i2", "DRAFT", "2026-09-20T00:00:00+07:00"),
        inv("i3", "PAID", "2026-09-20T00:00:00+07:00", "0"),
        inv("i4", "ISSUED", "2026-10-20T00:00:00+07:00"),
      ],
    });
    const hits = evaluateRules(s, ALL).candidates.filter((c) => c.rule === "invoice_overdue");
    assert.equal(hits.length, 1);
    assert.deepEqual(hits[0]!.userIds.sort(), [FIN, OWNER].sort());
    assert.equal(hits[0]!.params.days, 8);
  });

  it("quotation expiring within 3 days → sales owner", () => {
    const q = (id: string, status: string, until: string) => ({
      id,
      quotationNumber: id,
      customerId: "c1",
      status,
      validUntil: new Date(until),
      salesOwnerId: SALES,
    });
    const s = snap({
      quotations: [
        q("q1", "SENT", "2026-09-30T12:00:00+07:00"),
        q("q2", "ACCEPTED", "2026-09-29T12:00:00+07:00"),
        q("q3", "SENT", "2026-10-10T12:00:00+07:00"),
        q("q4", "SENT", "2026-09-20T12:00:00+07:00"),
      ],
    });
    const hits = evaluateRules(s, ALL).candidates.filter((c) => c.rule === "quote_expiring");
    assert.deepEqual(
      hits.map((h) => h.refId),
      ["q1"],
    );
    assert.deepEqual(hits[0]!.userIds.sort(), [OWNER, SALES].sort());
  });

  it("disabled rules produce nothing; unknown / inactive people fall back to admins", () => {
    const s = snap({ jobs: [job({ salesOwnerId: "gone", assignedOperator: null, customerId: "cx" })] });
    assert.equal(evaluateRules(s, new Set<RuleKey>(["invoice_overdue"])).candidates.length, 0);
    const hit = evaluateRules(s, ALL).candidates.find((c) => c.rule === "job_delayed")!;
    assert.deepEqual(hit.userIds, [ADMIN]);
  });

  it("old events (history) don't notify: long-delayed jobs, old overdue invoices, long-over free time", () => {
    const s = snap({
      jobs: [job({ eta: "2026-07-01" })],
      containers: [{ id: "b", containerNo: "B", jobId: null, customerId: "c1", status: "yard", direction: "in", eta: "2026-08-01" }],
      invoices: [
        {
          id: "i",
          invoiceNumber: "I",
          customerId: "c1",
          jobId: null,
          status: "ISSUED",
          dueDate: new Date("2025-01-01T00:00:00+07:00"),
          balanceDue: "10",
          currency: "THB",
        },
      ],
    });
    assert.equal(evaluateRules(s, ALL).candidates.length, 0);
  });

  it("LINE text is Thai and names the reference", () => {
    const t = lineText("free_time", "ABCU1234567", { days: -2, lfd: "2026-09-26" }, "ลูกค้า");
    assert.match(t, /ABCU1234567/);
    assert.match(t, /เกินวันฟรี 2 วัน/);
  });
});

describe("automation — dedupe", () => {
  it("dedupe keys are stable across runs and rows are unique per (user, key)", () => {
    const s = snap({ jobs: [job()] });
    const a = evaluateRules(s, ALL).candidates.map((c) => c.dedupeKey);
    const b = evaluateRules({ ...s, now: new Date(NOW.getTime() + 3600_000) }, ALL).candidates.map((c) => c.dedupeKey);
    assert.deepEqual(a, b);
    const cand = evaluateRules(s, ALL).candidates;
    const rows = expandCandidates(ORG, [...cand, ...cand]);
    assert.equal(
      rows.length,
      cand.reduce((n, c) => n + c.userIds.length, 0),
    );
    assert.equal(new Set(rows.map((r) => `${r.userId}|${r.dedupeKey}`)).size, rows.length);
  });

  it("running twice against the database creates nothing the second time (rolled back)", async (t) => {
    if (existsSync(".env")) {
      for (const line of readFileSync(".env", "utf8").split("\n")) {
        const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
      }
    }
    const { getDb, closeDb } = await import("../db/index.js");
    const db = getDb();
    if (!db) return t.skip("no DATABASE_URL");
    const { notifications } = await import("../db/schema/index.js");
    const { and, eq } = await import("drizzle-orm");
    const ROLLBACK = new Error("rollback");
    try {
      await db.transaction(async (tx) => {
        await tx.delete(notifications).where(and(eq(notifications.organizationId, ORG)));
        const first = await runAutomation(tx, ORG, { line: false });
        const second = await runAutomation(tx, ORG, { line: false });
        assert.ok(first.created > 0, "seed data should trigger at least one rule");
        assert.equal(second.created, 0);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/ECONNREFUSED|does not exist|authentication failed/i.test(msg)) t.skip(`db unavailable: ${msg}`);
        else throw e;
      }
    } finally {
      await closeDb();
    }
  });
});

describe("LINE linking", () => {
  it("verifies X-Line-Signature (HMAC-SHA256, base64)", () => {
    const body = JSON.stringify({ events: [] });
    const sig = createHmac("sha256", "s3cret").update(body).digest("base64");
    assert.equal(verifyLineSignature(body, sig, "s3cret"), true);
    assert.equal(verifyLineSignature(body, sig, "other"), false);
    assert.equal(verifyLineSignature(body + " ", sig, "s3cret"), false);
    assert.equal(verifyLineSignature(body, undefined, "s3cret"), false);
  });

  it("generates readable codes and extracts them from chat text", () => {
    for (let i = 0; i < 20; i++) {
      const c = generateLinkCode();
      assert.match(c, /^[A-HJ-NP-Z2-9]{6}$/);
      assert.equal(extractLinkCode(c.toLowerCase()), c);
    }
    assert.equal(extractLinkCode("LINK AB23CD"), "AB23CD");
    assert.equal(extractLinkCode("  รหัส: AB23CD "), "AB23CD");
    assert.equal(extractLinkCode("hello there"), null);
    assert.equal(extractLinkCode("please call me AB23CD"), null);
  });
});
