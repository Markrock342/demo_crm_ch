import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { findContainerNo, guessCategory } from "../domain/cases.js";
import { openSecret, sealSecret } from "../lib/secret-box.js";

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

describe("LINE inbox rules", () => {
  it("finds container numbers in chat text", () => {
    assert.equal(findContainerNo("ตู้ TGHU8812345 ลงเรือยัง"), "TGHU8812345");
    assert.equal(findContainerNo("tclu 330881-2 ถึงไหนแล้ว"), "TCLU3308812");
    assert.equal(findContainerNo("โทร 0812345678 ครับ"), null);
    assert.equal(findContainerNo("ABCD1234567"), null); // 4th letter must be U / J / Z
  });

  it("guesses a category from keywords; container alone → status", () => {
    assert.equal(guessCategory("ตู้ TGHU8812345 ลงเรือยัง"), "status_inquiry");
    assert.equal(guessCategory("ใบเสร็จตู้ SEGU4471230 ไม่ขึ้น"), "documents");
    assert.equal(guessCategory("ค่าฝากตู้คิดวันละเท่าไหร่"), "pricing");
    assert.equal(guessCategory("รถรอหน้าท่า 2 ชั่วโมงแล้ว"), "complaint");
    assert.equal(guessCategory("สวัสดีครับ"), "other");
  });

  it("seals credentials; a different key cannot open them", () => {
    const prev = process.env.SECRETS_KEY;
    process.env.SECRETS_KEY = "key-one";
    const sealed = sealSecret("channel-secret-123");
    assert.notEqual(sealed, "channel-secret-123");
    assert.ok(!sealed.includes("channel-secret"));
    assert.equal(openSecret(sealed), "channel-secret-123");
    process.env.SECRETS_KEY = "key-two";
    assert.equal(openSecret(sealed), null);
    assert.equal(openSecret("garbage"), null);
    if (prev === undefined) delete process.env.SECRETS_KEY;
    else process.env.SECRETS_KEY = prev;
  });
});

describe("LINE inbox APIs require sign-in", () => {
  for (const [method, path] of [
    ["GET", "/api/business-units"],
    ["POST", "/api/business-units"],
    ["GET", "/api/cases/line/channels"],
    ["POST", "/api/cases/line/channels"],
    ["POST", "/api/cases/line/channels/x/test-message"],
    ["GET", "/api/cases/x/media/y"],
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
  channel: string;
  category: string;
  customerId: string | null;
  containerNo: string | null;
  businessUnitId: string | null;
  assigneeUserId: string | null;
  firstRespondedAt: string | null;
  line: { displayName: string | null; channelName: string } | null;
};
type EventBody = { id: string; type: string; body: string | null; data: Record<string, unknown>; userId: string | null };

describe("LINE inbox (HTTP, local DB)", () => {
  it("webhook opens / continues cases, replies go back to LINE, units tag cases and customers", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-line";

    const { getDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { cases } = await import("../db/schema/cases.js");
    const { customers } = await import("../db/schema/crm.js");
    const { businessUnits, lineChannels } = await import("../db/schema/inbox.js");
    const { eq, inArray } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const marker = `t${Date.now()}`;
    const caseIds: string[] = [];
    const channelIds: string[] = [];
    const unitIds: string[] = [];
    let customerBefore: string[] | null = null;
    try {
      const byEmail = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
      const admin = await byEmail("admin@cangzhan.com");
      const cs = await byEmail("cs@cangzhan.com");
      if (!admin || !cs) return t.skip("no seed users — run db:seed");
      const tok = (id: string, email: string, role: string) => signSession({ sub: id, email, roles: [role], permissions: [], orgId: DEMO_ORG_ID });
      const adminTok = await tok(admin.id, "admin@cangzhan.com", "SUPER_ADMIN");
      const csTok = await tok(cs.id, "cs@cangzhan.com", "CUSTOMER_SERVICE");
      const call = (tk: string, method: string, path: string, body?: unknown) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${tk}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const json = async <T>(r: Response | Promise<Response>) => (await (await r).json()) as T;

      // Business units: admin only.
      assert.equal((await call(csTok, "POST", "/api/business-units", { name: `${marker} depot` })).status, 403);
      const unitRes = await call(adminTok, "POST", "/api/business-units", { name: `${marker} depot` });
      assert.equal(unitRes.status, 201);
      const unit = (await json<{ item: { id: string; color: string | null } }>(unitRes)).item;
      unitIds.push(unit.id);
      assert.ok(unit.color, "a colour is picked automatically");

      // Channels: CS can see but not manage; credentials never come back.
      assert.equal((await call(csTok, "POST", "/api/cases/line/channels", { name: `${marker} OA` })).status, 403);
      const secret = `secret-${marker}`;
      const chRes = await call(adminTok, "POST", "/api/cases/line/channels", {
        name: `${marker} OA`,
        channelSecret: secret,
        businessUnitId: unit.id,
        ackMessage: "รับเรื่อง {case} แล้ว",
      });
      assert.equal(chRes.status, 201);
      const ch = (await json<{ item: { id: string; webhookPath: string; connected: boolean } & Record<string, unknown> }>(chRes)).item;
      channelIds.push(ch.id);
      assert.equal(ch.connected, false, "secret without token is not connected yet");
      assert.ok(!JSON.stringify(ch).includes(secret));
      const list = await json<{ items: { id: string }[] }>(call(csTok, "GET", "/api/cases/line/channels"));
      assert.ok(list.items.some((c) => c.id === ch.id));
      const [stored] = await db.select().from(lineChannels).where(eq(lineChannels.id, ch.id));
      assert.ok(stored!.channelSecretEnc && !stored!.channelSecretEnc.includes(secret), "secret stored encrypted");

      // Webhook: signed with that channel's secret.
      const hook = (payload: unknown, sig?: string) => {
        const raw = JSON.stringify(payload);
        return app.request(`http://localhost${ch.webhookPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-line-signature": sig ?? createHmac("sha256", secret).update(raw).digest("base64") },
          body: raw,
        });
      };
      const userId = `U${marker}`;
      const msg = (id: string, text: string) => ({
        type: "message",
        replyToken: "r",
        source: { type: "user", userId },
        message: { id, type: "text", text },
      });
      assert.equal((await hook({ events: [] }, "bad")).status, 401);
      assert.equal(
        (await app.request("http://localhost/api/webhooks/line/nope", { method: "POST", body: "{}", headers: { "x-line-signature": "x" } })).status,
        404,
      );
      assert.equal((await hook({ destination: "Ubot", events: [] })).status, 200, "LINE's 'Verify' call");

      // First message → new unassigned LINE case in the channel's unit, container + category guessed.
      assert.equal((await hook({ events: [msg(`${marker}-1`, `ตู้ TGHU8812345 ลงเรือยัง ${marker}`)] })).status, 200);
      const found = await json<{ items: CaseBody[] }>(call(csTok, "GET", `/api/cases?status=all&channel=line&q=${encodeURIComponent(marker)}`));
      assert.equal(found.items.length, 1);
      const k = found.items[0]!;
      caseIds.push(k.id);
      assert.equal(k.channel, "line");
      assert.equal(k.status, "new");
      assert.equal(k.assigneeUserId, null);
      assert.equal(k.businessUnitId, unit.id);
      assert.equal(k.containerNo, "TGHU8812345");
      assert.equal(k.category, "status_inquiry");
      assert.equal(k.line?.channelName, `${marker} OA`);

      // Redelivery of the same message id is ignored; a new message joins the open case.
      await hook({ events: [msg(`${marker}-1`, `ตู้ TGHU8812345 ลงเรือยัง ${marker}`)] });
      await hook({ events: [msg(`${marker}-2`, "ด่วนนะครับ")] });
      let detail = await json<{ case: CaseBody; events: EventBody[] }>(call(csTok, "GET", `/api/cases/${k.id}`));
      const inbound = detail.events.filter((e) => e.type === "inbound");
      assert.deepEqual(inbound.map((e) => e.body), [`ตู้ TGHU8812345 ลงเรือยัง ${marker}`, "ด่วนนะครับ"]);
      assert.equal(inbound[0]!.data.via, "line");
      assert.equal(detail.events.find((e) => e.type === "created")!.userId, null);

      // Filter by unit; stats count it.
      const byUnit = await json<{ items: CaseBody[] }>(call(csTok, "GET", `/api/cases?status=open&unit=${unit.id}`));
      assert.ok(byUnit.items.some((x) => x.id === k.id));
      const stats = await json<{ byUnit: Record<string, number>; byChannel: Record<string, number> }>(call(csTok, "GET", "/api/cases/stats"));
      assert.ok((stats.byUnit[unit.id] ?? 0) >= 1);
      assert.ok(stats.byChannel.line >= 1);

      // Reply via LINE: no access token → logged, not sent; still counts as the first response.
      const rep = await json<{ line: { delivery: string } | null; case: CaseBody }>(
        call(csTok, "POST", `/api/cases/${k.id}/reply`, { via: "line", body: "ตู้ลงแล้วครับ", status: "waiting_customer" }),
      );
      assert.equal(rep.line?.delivery, "not_connected");
      assert.ok(rep.case.firstRespondedAt);
      assert.equal(rep.case.status, "waiting_customer");

      // Customer writes back → waiting → in progress, automatically.
      await hook({ events: [msg(`${marker}-3`, "ขอบคุณครับ")] });
      detail = await json<{ case: CaseBody; events: EventBody[] }>(call(csTok, "GET", `/api/cases/${k.id}`));
      assert.equal(detail.case.status, "in_progress");
      assert.ok(detail.events.some((e) => e.type === "status" && e.data.auto === "customer_replied"));

      // Linking the customer on the case remembers it for that chat's next cases.
      assert.equal((await call(csTok, "PATCH", `/api/cases/${k.id}`, { customerId: "c10", status: "resolved" })).status, 200);
      await hook({ events: [msg(`${marker}-4`, `ขอใบเสร็จ ${marker}`)] });
      const next = await json<{ items: CaseBody[] }>(call(csTok, "GET", `/api/cases?status=open&channel=line&q=${encodeURIComponent(`ขอใบเสร็จ ${marker}`)}`));
      assert.equal(next.items.length, 1);
      caseIds.push(next.items[0]!.id);
      assert.notEqual(next.items[0]!.id, k.id, "resolved case is not reopened — a new case starts");
      assert.equal(next.items[0]!.customerId, "c10");
      assert.equal(next.items[0]!.category, "documents");

      // Test sender (settings): admin only, behaves like a chat.
      assert.equal((await call(csTok, "POST", `/api/cases/line/channels/${ch.id}/test-message`, { name: "x", text: "y" })).status, 403);
      const sim = await call(adminTok, "POST", `/api/cases/line/channels/${ch.id}/test-message`, { name: `ลูกค้าทดสอบ ${marker}`, text: "ขอราคาค่ายกตู้" });
      assert.equal(sim.status, 201);
      const simBody = await json<{ caseId: string; created: boolean }>(sim);
      caseIds.push(simBody.caseId);
      assert.equal(simBody.created, true);
      const simCase = await json<{ case: CaseBody }>(call(csTok, "GET", `/api/cases/${simBody.caseId}`));
      assert.equal(simCase.case.line?.displayName, `ลูกค้าทดสอบ ${marker}`);
      assert.equal(simCase.case.category, "pricing");

      // Media: nothing stored → 404 (and never another org's file).
      assert.equal((await call(csTok, "GET", `/api/cases/${k.id}/media/${inbound[0]!.id}`)).status, 404);

      // Customers: unit ids are kept only when they belong to the company.
      const [cust] = await db.select({ units: customers.businessUnits }).from(customers).where(eq(customers.id, "c10"));
      customerBefore = cust?.units ?? [];
      const patched = await call(adminTok, "PATCH", "/api/customers/c10", { businessUnits: [unit.id, "bu-not-ours"] });
      assert.equal(patched.status, 200);
      const [after] = await db.select({ units: customers.businessUnits }).from(customers).where(eq(customers.id, "c10"));
      assert.deepEqual(after!.units, [unit.id]);
      const custList = await json<{ items: { id: string }[] }>(call(adminTok, "GET", `/api/customers?unit=${unit.id}&limit=50`));
      assert.ok(custList.items.some((c) => c.id === "c10"));

      // Archiving a unit hides it from pickers but keeps it on old cases.
      await call(adminTok, "PATCH", `/api/business-units/${unit.id}`, { archived: true });
      const active = await json<{ items: { id: string }[] }>(call(csTok, "GET", "/api/business-units"));
      assert.ok(!active.items.some((u) => u.id === unit.id));
      const all = await json<{ items: { id: string; archived: boolean }[] }>(call(csTok, "GET", "/api/business-units?all=1"));
      assert.equal(all.items.find((u) => u.id === unit.id)?.archived, true);
    } finally {
      if (customerBefore) await db.update(customers).set({ businessUnits: customerBefore }).where(eq(customers.id, "c10"));
      if (caseIds.length) await db.delete(cases).where(inArray(cases.id, caseIds));
      if (channelIds.length) await db.delete(lineChannels).where(inArray(lineChannels.id, channelIds));
      if (unitIds.length) await db.delete(businessUnits).where(inArray(businessUnits.id, unitIds));
    }
  });
});
