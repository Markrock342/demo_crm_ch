import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { hasPermission, type RoleCode } from "../domain/rbac.js";
import { DEFAULT_SLA, caseSla, computeDue, fmtCannedDate, mergePolicy, renderCanned, timerState } from "../domain/cases.js";
import { RULE_KEYS, evaluateCaseRules, evaluateRules, expandCandidates, type RuleKey, type SnapCase, type Snapshot } from "./automation.service.js";
import { stageWithDates } from "./case.service.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const H = 3_600_000;

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

describe("case permissions", () => {
  it("CS works cases, managers manage them, sales / marketing only look", () => {
    const can = (r: RoleCode, p: Parameters<typeof hasPermission>[1]) => hasPermission([r], p);
    assert.equal(can("CUSTOMER_SERVICE", "case.view"), true);
    assert.equal(can("CUSTOMER_SERVICE", "case.edit"), true);
    assert.equal(can("CUSTOMER_SERVICE", "case.manage"), false);
    assert.equal(can("MANAGEMENT", "case.manage"), true);
    assert.equal(can("SUPER_ADMIN", "case.manage"), true);
    for (const r of ["SALES", "MARKETING"] as RoleCode[]) {
      assert.equal(can(r, "case.view"), true, r);
      assert.equal(can(r, "case.edit"), false, r);
    }
    assert.equal(can("ACCOUNTING", "case.view"), false);
    assert.equal(can("VIEWER", "case.view"), false);
  });
});

describe("case SLA", () => {
  const opened = new Date("2026-10-06T02:00:00Z");

  it("due times follow the priority targets (and org overrides)", () => {
    const urgent = computeDue(opened, "urgent");
    assert.equal(urgent.firstResponseDueAt.getTime() - opened.getTime(), 1 * H);
    assert.equal(urgent.resolveDueAt.getTime() - opened.getTime(), 4 * H);
    const low = computeDue(opened, "low");
    assert.equal(low.resolveDueAt.getTime() - opened.getTime(), 5 * 24 * H);
    const policy = mergePolicy([{ priority: "normal", firstResponseMinutes: 30, resolveMinutes: 120 }, { priority: "bogus", firstResponseMinutes: 1, resolveMinutes: 1 }]);
    assert.equal(policy.normal.firstResponseMinutes, 30);
    assert.deepEqual(policy.high, DEFAULT_SLA.high);
    assert.equal(computeDue(opened, "normal", policy).resolveDueAt.getTime() - opened.getTime(), 2 * H);
  });

  it("timer states: ok → warning (< 25 % left) → breached; met / late once stopped", () => {
    const due = new Date(opened.getTime() + 4 * H);
    assert.equal(timerState(opened, due, null, new Date(opened.getTime() + 1 * H)).state, "ok");
    assert.equal(timerState(opened, due, null, new Date(opened.getTime() + 3.5 * H)).state, "warning");
    const late = timerState(opened, due, null, new Date(opened.getTime() + 5 * H));
    assert.equal(late.state, "breached");
    assert.equal(late.leftMinutes, -60);
    assert.equal(timerState(opened, due, new Date(opened.getTime() + 2 * H), new Date()).state, "met");
    assert.equal(timerState(opened, due, new Date(opened.getTime() + 6 * H), new Date()).state, "late");
  });

  it("case SLA: first response runs until a reply, then resolution; closed cases stop", () => {
    const due = computeDue(opened, "high");
    const base = { createdAt: opened, ...due, firstRespondedAt: null, resolvedAt: null };
    const fresh = caseSla({ ...base, status: "new" }, new Date(opened.getTime() + 1 * H));
    assert.equal(fresh.active, "first");
    assert.equal(fresh.state, "ok");
    const noReply = caseSla({ ...base, status: "new" }, new Date(opened.getTime() + 5 * H));
    assert.equal(noReply.state, "breached");
    assert.equal(noReply.breached, true);
    const replied = caseSla({ ...base, status: "in_progress", firstRespondedAt: new Date(opened.getTime() + 1 * H) }, new Date(opened.getTime() + 20 * H));
    assert.equal(replied.active, "resolve");
    assert.equal(replied.first.state, "met");
    assert.equal(replied.state, "warning");
    const closed = caseSla({ ...base, status: "closed", resolvedAt: new Date(opened.getTime() + 2 * H) }, new Date(opened.getTime() + 100 * H));
    assert.equal(closed.active, null);
    assert.equal(closed.breached, false);
    assert.equal(closed.state, "met");
  });

  it("lookup stage: dates win when statuses lag", () => {
    assert.equal(stageWithDates(0, "2026-10-01", "2026-10-10", "2026-10-06"), 2);
    assert.equal(stageWithDates(1, "2026-10-01", "2026-10-05", "2026-10-06"), 3);
    assert.equal(stageWithDates(4, "2026-10-01", "2026-10-05", "2026-10-06"), 4);
    assert.equal(stageWithDates(0, null, null, "2026-10-06"), 0);
  });
});

describe("canned reply variables", () => {
  it("fills known values and leaves the rest visible", () => {
    const out = renderCanned("เรียน {customer} ตู้ {container} เรือ {vessel} ETA {eta} งาน {job} — {agent} {unknown}", {
      customer: "ระยองไทยฟู้ด",
      container: "TCLU3308812",
      vessel: "ONE COMMITMENT 052N",
      eta: "8 ต.ค. 2026",
      job: null,
      agent: " ",
    });
    assert.equal(out.text, "เรียน ระยองไทยฟู้ด ตู้ TCLU3308812 เรือ ONE COMMITMENT 052N ETA 8 ต.ค. 2026 งาน {job} — {agent} {unknown}");
    assert.deepEqual(out.missing, ["job", "agent"]);
  });

  it("formats ETA per language", () => {
    assert.equal(fmtCannedDate("2026-10-08", "th"), "8 ต.ค. 2026");
    assert.equal(fmtCannedDate("2026-10-08T00:00:00Z", "en"), "8 Oct 2026");
    assert.equal(fmtCannedDate("2026-10-08", "zh"), "2026年10月8日");
    assert.equal(fmtCannedDate(null), null);
  });
});

describe("case automation rules", () => {
  const NOW = new Date("2026-10-06T05:00:00Z");
  const CS = "00000000-0000-4000-8000-0000000000c5";
  const MGR = "00000000-0000-4000-8000-0000000000a1";
  const ADMIN = "00000000-0000-4000-8000-0000000000ad";
  const LEAD = "00000000-0000-4000-8000-0000000000b2";
  const snap = (cases: SnapCase[], members = [
    { id: CS, roles: ["CUSTOMER_SERVICE"], orgRole: "member" },
    { id: MGR, roles: ["MANAGEMENT"], orgRole: "member" },
    { id: ADMIN, roles: ["SUPER_ADMIN"], orgRole: "owner" },
    { id: LEAD, roles: ["CUSTOMER_SERVICE"], orgRole: "member" },
  ]): Snapshot => ({
    now: NOW,
    timezone: "Asia/Bangkok",
    members,
    customers: [],
    jobs: [],
    containers: [],
    docs: [],
    invoices: [],
    quotations: [],
    cases,
  });
  const kase = (over: Partial<SnapCase> = {}): SnapCase => ({
    id: "cs_1",
    caseNo: "CS-2026-000001",
    subject: "ตู้ถึงเมื่อไร",
    customerId: "c1",
    status: "new",
    priority: "urgent",
    assigneeUserId: CS,
    assignedAt: new Date(NOW.getTime() - 1 * H),
    assignedBy: LEAD,
    firstResponseDueAt: new Date(NOW.getTime() - 2 * H),
    resolveDueAt: new Date(NOW.getTime() + 2 * H),
    firstRespondedAt: null,
    resolvedAt: null,
    ...over,
  });
  const ALL = new Set<RuleKey>(RULE_KEYS);

  it("assignment notifies the assignee (not when people pick a case themselves)", () => {
    const out = evaluateCaseRules(snap([kase()]), ALL).filter((c) => c.rule === "case_assigned");
    assert.equal(out.length, 1);
    assert.deepEqual(out[0]!.userIds, [CS]);
    assert.equal(out[0]!.href, "/cases/cs_1");
    assert.equal(evaluateCaseRules(snap([kase({ assignedBy: CS })]), ALL).filter((c) => c.rule === "case_assigned").length, 0);
    const old = kase({ assignedAt: new Date(NOW.getTime() - 30 * 24 * H) });
    assert.equal(evaluateCaseRules(snap([old]), ALL).filter((c) => c.rule === "case_assigned").length, 0);
  });

  it("SLA breach notifies assignee + managers once per due time; resolved / stale / off rules are quiet", () => {
    const out = evaluateCaseRules(snap([kase()]), ALL).filter((c) => c.rule === "case_sla");
    assert.equal(out.length, 1);
    assert.equal(out[0]!.params.timer, "first");
    assert.equal(out[0]!.params.hours, 2);
    assert.deepEqual(new Set(out[0]!.userIds), new Set([CS, MGR]));
    assert.match(out[0]!.dedupeKey, /^case_sla:cs_1:first:/);
    // Expanded rows dedupe per user.
    assert.equal(expandCandidates("org", [...out, ...out]).length, 2);

    const both = kase({ resolveDueAt: new Date(NOW.getTime() - 1 * H) });
    assert.equal(evaluateCaseRules(snap([both]), ALL).filter((c) => c.rule === "case_sla").length, 2);
    assert.equal(evaluateCaseRules(snap([kase({ status: "resolved" })]), ALL).length, 0);
    assert.equal(evaluateCaseRules(snap([kase({ firstResponseDueAt: new Date(NOW.getTime() - 20 * 24 * H) })]), ALL).filter((c) => c.rule === "case_sla").length, 0);
    assert.equal(evaluateCaseRules(snap([kase()]), new Set<RuleKey>(["job_delayed"])).length, 0);

    // No managers in the org → admins hear about it; unassigned case still notifies someone.
    const noMgr = snap([kase({ assigneeUserId: null, assignedAt: null })], [
      { id: CS, roles: ["CUSTOMER_SERVICE"], orgRole: "member" },
      { id: ADMIN, roles: ["SUPER_ADMIN"], orgRole: "owner" },
    ]);
    const sla = evaluateCaseRules(noMgr, ALL).filter((c) => c.rule === "case_sla");
    assert.deepEqual(sla[0]!.userIds, [ADMIN]);
  });

  it("runs inside evaluateRules and counts matches", () => {
    const ev = evaluateRules(snap([kase()]), ALL);
    assert.equal(ev.matched.case_assigned, 1);
    assert.equal(ev.matched.case_sla, 1);
    // Older callers without cases still work.
    const { cases: _c, ...rest } = snap([]);
    assert.equal(evaluateRules(rest as Snapshot, ALL).matched.case_sla, 0);
  });
});

describe("case APIs require sign-in", () => {
  for (const [method, path] of [
    ["GET", "/api/cases"],
    ["GET", "/api/cases/stats"],
    ["POST", "/api/cases"],
    ["PATCH", "/api/cases/x"],
    ["POST", "/api/cases/x/reply"],
    ["GET", "/api/cases/canned"],
    ["POST", "/api/cases/canned"],
    ["GET", "/api/cases/lookup?q=AB"],
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

type CaseBody = {
  id: string;
  caseNo: string;
  status: string;
  priority: string;
  assigneeUserId: string | null;
  customerId: string | null;
  containerNo: string | null;
  jobId: string | null;
  firstResponseDueAt: string;
  resolveDueAt: string;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  sla: { state: string; active: string | null };
};

describe("case APIs (HTTP, local DB)", () => {
  it("creates, lists, updates, notes, replies, canned replies, lookup and stats with permissions", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-cases";
    process.env.EMAIL_TRANSPORT = "sandbox";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { cannedReplies, cases } = await import("../db/schema/cases.js");
    const { mails } = await import("../db/schema/comms.js");
    const { notifications } = await import("../db/schema/notifications.js");
    const { and, eq, inArray, like } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const marker = `test-case-${Date.now()}`;
    const createdIds: string[] = [];
    try {
      const byEmail = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
      const admin = await byEmail("admin@cangzhan.com");
      const cs = await byEmail("cs@cangzhan.com");
      const sales = await byEmail("sales@cangzhan.com");
      if (!admin || !cs || !sales) return t.skip("no seed users — run db:seed");
      const tok = (id: string, email: string, role: string) => signSession({ sub: id, email, roles: [role], permissions: [], orgId: DEMO_ORG_ID });
      const adminTok = await tok(admin.id, "admin@cangzhan.com", "SUPER_ADMIN");
      const csTok = await tok(cs.id, "cs@cangzhan.com", "CUSTOMER_SERVICE");
      const salesTok = await tok(sales.id, "sales@cangzhan.com", "SALES");
      const call = (tk: string, method: string, path: string, body?: unknown) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${tk}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const json = async <T>(r: Response | Promise<Response>) => (await (await r).json()) as T;

      // Validation + foreign ids.
      const bad = await call(csTok, "POST", "/api/cases", { subject: " " });
      assert.equal(bad.status, 400);
      const foreign = await call(csTok, "POST", "/api/cases", { subject: marker, customerId: "nope" });
      assert.equal(foreign.status, 400);
      assert.equal((await json<{ issues: { path: string }[] }>(foreign)).issues[0]!.path, "customerId");
      const wrongContact = await call(csTok, "POST", "/api/cases", { subject: marker, customerId: "c1", contactId: "p3" });
      assert.equal(wrongContact.status, 400);

      // Sales may look but not create.
      assert.equal((await call(salesTok, "POST", "/api/cases", { subject: marker })).status, 403);
      assert.equal((await call(salesTok, "GET", "/api/cases")).status, 200);

      // The demo company's own SLA targets (seeded: 30-minute first response).
      const policy = (await json<{ policy: Record<string, { firstResponseMinutes: number; resolveMinutes: number }> }>(call(csTok, "GET", "/api/cases/sla"))).policy;
      const M = 60_000;

      // CS creates an urgent case on a job: customer inherited, assignee defaults to self, SLA from priority.
      const res = await call(csTok, "POST", "/api/cases", {
        subject: `${marker} where is my box`,
        priority: "urgent",
        category: "status_inquiry",
        channel: "line",
        jobId: "s2",
        containerNo: " tclu3308812 ",
      });
      assert.equal(res.status, 201);
      const k = (await json<{ case: CaseBody }>(res)).case;
      createdIds.push(k.id);
      assert.match(k.caseNo, /^CS-\d{4}-\d{6}$/);
      assert.equal(k.customerId, "c9");
      assert.equal(k.containerNo, "TCLU3308812");
      assert.equal(k.assigneeUserId, cs.id);
      assert.equal(k.status, "new");
      assert.equal(new Date(k.firstResponseDueAt).getTime() - new Date(k.createdAt).getTime(), policy.urgent!.firstResponseMinutes * M);
      assert.equal(new Date(k.resolveDueAt).getTime() - new Date(k.createdAt).getTime(), policy.urgent!.resolveMinutes * M);
      assert.equal(k.sla.active, "first");

      // List filters + counts.
      const mine = await json<{ items: CaseBody[]; counts: Record<string, number> }>(call(csTok, "GET", `/api/cases?assignee=mine&status=open&q=${encodeURIComponent(marker)}`));
      assert.deepEqual(mine.items.map((x) => x.id), [k.id]);
      assert.equal(mine.counts.new, 1);
      const unassigned = await json<{ items: CaseBody[] }>(call(csTok, "GET", `/api/cases?assignee=unassigned&q=${encodeURIComponent(marker)}`));
      assert.equal(unassigned.items.length, 0);
      const byBox = await json<{ items: CaseBody[] }>(call(csTok, "GET", `/api/cases?status=all&q=TCLU3308812&category=status_inquiry&priority=urgent`));
      assert.ok(byBox.items.some((x) => x.id === k.id));

      // Reassign to admin → a "case_assigned" notification for admin.
      const assigned = await json<{ case: CaseBody }>(call(csTok, "PATCH", `/api/cases/${k.id}`, { assigneeUserId: admin.id, priority: "high" }));
      assert.equal(assigned.case.assigneeUserId, admin.id);
      assert.equal(new Date(assigned.case.resolveDueAt).getTime() - new Date(k.createdAt).getTime(), policy.high!.resolveMinutes * M);
      const notes = await db
        .select({ kind: notifications.kind })
        .from(notifications)
        .where(and(eq(notifications.userId, admin.id), eq(notifications.refId, k.id)));
      assert.ok(notes.some((n) => n.kind === "case_assigned"));
      assert.equal((await call(csTok, "PATCH", `/api/cases/${k.id}`, { assigneeUserId: "00000000-0000-4000-8000-000000000000" })).status, 400);

      // Internal note + reply by email (sandbox) → first response recorded, new → in progress.
      assert.equal((await call(csTok, "POST", `/api/cases/${k.id}/notes`, { body: `${marker} checked with the line` })).status, 201);
      assert.equal((await call(salesTok, "POST", `/api/cases/${k.id}/notes`, { body: "x" })).status, 403);
      const reply = await call(csTok, "POST", `/api/cases/${k.id}/reply`, { via: "email", body: `${marker} your box arrived`, to: ["ops@example.com"] });
      assert.equal(reply.status, 201);
      const rep = await json<{ mail: { status: string; id: string }; case: CaseBody }>(reply);
      assert.equal(rep.mail.status, "sent");
      assert.ok(rep.case.firstRespondedAt);
      assert.equal(rep.case.status, "in_progress");
      assert.equal((await call(csTok, "POST", `/api/cases/${k.id}/reply`, { via: "email", body: "x", to: ["not-an-email"] })).status, 400);
      const phone = await json<{ mail: null; case: CaseBody }>(call(csTok, "POST", `/api/cases/${k.id}/reply`, { via: "phone", body: "called back", status: "waiting_customer" }));
      assert.equal(phone.mail, null);
      assert.equal(phone.case.status, "waiting_customer");

      const detail = await json<{ case: CaseBody; events: { type: string }[]; contacts: unknown[] }>(call(salesTok, "GET", `/api/cases/${k.id}`));
      assert.deepEqual(
        detail.events.map((e) => e.type),
        ["created", "priority", "assignment", "comment", "reply", "status", "reply", "status"],
      );
      assert.ok(detail.contacts.length > 0);

      // Resolve → resolvedAt; reopen clears it.
      const resolved = await json<{ case: CaseBody }>(call(csTok, "PATCH", `/api/cases/${k.id}`, { status: "resolved" }));
      assert.ok(resolved.case.resolvedAt);
      const reopened = await json<{ case: CaseBody }>(call(csTok, "PATCH", `/api/cases/${k.id}`, { status: "in_progress" }));
      assert.equal(reopened.case.resolvedAt, null);
      assert.equal((await call(csTok, "GET", "/api/cases/nope")).status, 404);

      // Canned replies: CS can use but not manage; admin manages; render fills from the linked job.
      assert.equal((await call(csTok, "POST", "/api/cases/canned", { title: marker, body: "x" })).status, 403);
      const cr = await call(adminTok, "POST", "/api/cases/canned", { title: marker, body: "{customer} {container} {job} {vessel} {eta} {agent}", category: "status_inquiry" });
      assert.equal(cr.status, 201);
      const crId = (await json<{ item: { id: string } }>(cr)).item.id;
      const rendered = await json<{ text: string; missing: string[] }>(call(csTok, "POST", "/api/cases/canned/render", { caseId: k.id, cannedId: crId, lang: "th" }));
      assert.ok(rendered.text.includes("TCLU3308812"));
      assert.ok(rendered.text.includes("JOB-"));
      assert.ok(rendered.text.includes("ณภัทร") || rendered.text.includes("Napat"));
      assert.ok(!rendered.missing.includes("customer"));
      assert.equal((await call(adminTok, "PATCH", `/api/cases/canned/${crId}`, { title: `${marker} 2` })).status, 200);
      assert.equal((await call(adminTok, "DELETE", `/api/cases/canned/${crId}`)).status, 200);

      // SLA policy: managers only.
      assert.equal((await call(csTok, "PUT", "/api/cases/sla", { low: { firstResponseMinutes: 60, resolveMinutes: 120 } })).status, 403);
      assert.equal((await call(adminTok, "PUT", "/api/cases/sla", { low: { firstResponseMinutes: 600, resolveMinutes: 60 } })).status, 400);

      // Status lookup and stats.
      const look = await json<{ items: { kind: string; ref: string; jobNumber: string | null; stage: number }[] }>(call(csTok, "GET", "/api/cases/lookup?q=TCLU3308812"));
      assert.ok(look.items.some((h) => h.kind === "container" && h.ref === "TCLU3308812" && h.jobNumber));
      const stats = await json<{ open: number; byCategory: Record<string, number> }>(call(csTok, "GET", "/api/cases/stats"));
      assert.ok(stats.open >= 1);
      assert.ok(stats.byCategory.status_inquiry >= 1);

      // Only managers delete.
      assert.equal((await call(csTok, "DELETE", `/api/cases/${k.id}`)).status, 403);
      assert.equal((await call(adminTok, "DELETE", `/api/cases/${k.id}`)).status, 200);
      createdIds.length = 0;
    } catch (e) {
      const down = isDbDown(e);
      if (down) return t.skip(`database unavailable: ${down}`);
      throw e;
    } finally {
      if (createdIds.length) await db.delete(cases).where(inArray(cases.id, createdIds)).catch(() => undefined);
      await db.delete(cases).where(like(cases.subject, `${marker}%`)).catch(() => undefined);
      await db.delete(cannedReplies).where(like(cannedReplies.title, `${marker}%`)).catch(() => undefined);
      await db.delete(mails).where(and(eq(mails.entityType, "case"), like(mails.bodyEn, `${marker}%`))).catch(() => undefined);
      await db.delete(notifications).where(like(notifications.body, `${marker}%`)).catch(() => undefined);
      await closeDb();
    }
  });
});
