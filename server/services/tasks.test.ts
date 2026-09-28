import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { hasPermission } from "../domain/rbac.js";

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

describe("task permissions", () => {
  it("only managers see everyone's tasks; every working role can log activity", () => {
    assert.equal(hasPermission(["MANAGEMENT"], "task.view_all"), true);
    assert.equal(hasPermission(["SUPER_ADMIN"], "task.view_all"), true);
    assert.equal(hasPermission(["SALES"], "task.view_all"), false);
    for (const r of ["SALES", "PRICING", "CUSTOMER_SERVICE", "OPERATIONS", "ACCOUNTING", "MANAGEMENT"] as const) {
      assert.equal(hasPermission([r], "activity.create"), true, r);
    }
    assert.equal(hasPermission(["VIEWER"], "activity.create"), false);
  });
});

describe("task + activity APIs require sign-in", () => {
  for (const [method, path] of [
    ["GET", "/api/tasks"],
    ["POST", "/api/tasks"],
    ["PATCH", "/api/tasks/x"],
    ["POST", "/api/tasks/x/complete"],
    ["DELETE", "/api/tasks/x"],
    ["GET", "/api/activities"],
    ["POST", "/api/activities"],
  ] as const) {
    it(`${method} ${path} → 401`, async () => {
      const res = await app.request(`http://localhost${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" || method === "DELETE" ? undefined : "{}",
      });
      assert.equal(res.status, 401);
    });
  }
});

type TaskBody = { id: string; title: string; status: string; done: boolean; ownerUserId: string | null; customerId: string | null; completedAt: string | null };

describe("task APIs (HTTP, local DB)", () => {
  it("creates, assigns, filters, completes, reopens and scopes tasks by owner", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-tasks";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { activities, tasks } = await import("../db/schema/tasks.js");
    const { eq, like } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const marker = `test-task-${Date.now()}`;
    try {
      const byEmail = async (email: string) =>
        (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
      const admin = await byEmail("admin@cangzhan.com");
      const sales = await byEmail("sales@cangzhan.com");
      const ops = await byEmail("ops@cangzhan.com");
      if (!admin || !sales || !ops) return t.skip("no seed users — run db:seed");

      const tok = (id: string, email: string, role: string) =>
        signSession({ sub: id, email, roles: [role], permissions: [], orgId: DEMO_ORG_ID });
      const adminTok = await tok(admin.id, "admin@cangzhan.com", "SUPER_ADMIN");
      const salesTok = await tok(sales.id, "sales@cangzhan.com", "SALES");
      const opsTok = await tok(ops.id, "ops@cangzhan.com", "OPERATIONS");
      const call = (tk: string, method: string, path: string, body?: unknown) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${tk}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      // Validation: title required, foreign ids rejected with a field error.
      const bad = await call(salesTok, "POST", "/api/tasks", { title: " " });
      assert.equal(bad.status, 400);
      assert.ok(((await bad.json()) as { issues: { path: string }[] }).issues.some((i) => i.path === "title"));
      const foreign = await call(salesTok, "POST", "/api/tasks", { title: marker, customerId: "nope-customer" });
      assert.equal(foreign.status, 400);
      assert.equal(((await foreign.json()) as { issues: { path: string }[] }).issues[0]!.path, "customerId");
      const foreignOwner = await call(salesTok, "POST", "/api/tasks", { title: marker, ownerUserId: "00000000-0000-4000-8000-000000000000" });
      assert.equal(foreignOwner.status, 400);

      // Sales creates a task (owner defaults to self) on customer c1, and one for ops.
      const created = await call(salesTok, "POST", "/api/tasks", { title: `${marker} mine`, customerId: "c1", priority: "high", dueAt: new Date().toISOString() });
      assert.equal(created.status, 201);
      const mine = ((await created.json()) as { task: TaskBody }).task;
      assert.equal(mine.ownerUserId, sales.id);
      assert.equal(mine.status, "open");
      const handed = ((await (await call(salesTok, "POST", "/api/tasks", { title: `${marker} for ops`, ownerUserId: ops.id })).json()) as { task: TaskBody }).task;

      // "mine" lists only owned tasks; ops sees the handed task but not sales' own one.
      const salesMine = (await (await call(salesTok, "GET", `/api/tasks?q=${marker}`)).json()) as { items: TaskBody[]; total: number };
      assert.deepEqual(salesMine.items.map((x) => x.id), [mine.id]);
      const salesAll = (await (await call(salesTok, "GET", `/api/tasks?scope=all&q=${marker}`)).json()) as { items: TaskBody[] };
      assert.equal(salesAll.items.length, 2);
      const opsAll = (await (await call(opsTok, "GET", `/api/tasks?scope=all&q=${marker}`)).json()) as { items: TaskBody[] };
      assert.deepEqual(opsAll.items.map((x) => x.id), [handed.id]);
      assert.equal((await call(opsTok, "GET", `/api/tasks/${mine.id}`)).status, 404);
      assert.equal((await call(opsTok, "POST", `/api/tasks/${mine.id}/complete`)).status, 404);
      // Managers see everything.
      const adminAll = (await (await call(adminTok, "GET", `/api/tasks?scope=all&q=${marker}`)).json()) as { items: TaskBody[] };
      assert.equal(adminAll.items.length, 2);
      const byCustomer = (await (await call(adminTok, "GET", `/api/tasks?scope=all&customerId=c1&q=${marker}`)).json()) as { items: TaskBody[] };
      assert.deepEqual(byCustomer.items.map((x) => x.id), [mine.id]);

      // Complete → done + an activity on the customer timeline; reopen clears completedAt.
      const done = ((await (await call(salesTok, "POST", `/api/tasks/${mine.id}/complete`)).json()) as { task: TaskBody }).task;
      assert.equal(done.done, true);
      assert.ok(done.completedAt);
      const acts = (await (await call(salesTok, "GET", "/api/activities?customerId=c1&limit=5")).json()) as { items: { taskId: string | null; type: string }[] };
      assert.ok(acts.items.some((a) => a.taskId === mine.id && a.type === "task"));
      const openList = (await (await call(salesTok, "GET", `/api/tasks?status=open&q=${marker}`)).json()) as { items: TaskBody[] };
      assert.equal(openList.items.length, 0);
      const reopened = ((await (await call(salesTok, "POST", `/api/tasks/${mine.id}/reopen`)).json()) as { task: TaskBody }).task;
      assert.equal(reopened.status, "open");
      assert.equal(reopened.completedAt, null);

      // Activities: validation + create.
      assert.equal((await call(salesTok, "POST", "/api/activities", { type: "call", body: "x" })).status, 400);
      assert.equal((await call(salesTok, "POST", "/api/activities", { type: "fax", body: "x", customerId: "c1" })).status, 400);
      const act = await call(salesTok, "POST", "/api/activities", { type: "call", body: `${marker} call`, customerId: "c1" });
      assert.equal(act.status, 201);
      const actId = ((await act.json()) as { activity: { id: string } }).activity.id;
      assert.equal((await call(opsTok, "DELETE", `/api/activities/${actId}`)).status, 404);
      assert.equal((await call(salesTok, "DELETE", `/api/activities/${actId}`)).status, 200);

      // Delete.
      assert.equal((await call(opsTok, "DELETE", `/api/tasks/${mine.id}`)).status, 404);
      assert.equal((await call(salesTok, "DELETE", `/api/tasks/${mine.id}`)).status, 200);
      assert.equal((await call(adminTok, "DELETE", `/api/tasks/${handed.id}`)).status, 200);
    } catch (e) {
      const down = isDbDown(e);
      if (down) return t.skip(`database unavailable: ${down}`);
      throw e;
    } finally {
      await db.delete(activities).where(like(activities.body, `${marker}%`)).catch(() => undefined);
      await db.delete(tasks).where(like(tasks.title, `${marker}%`)).catch(() => undefined);
      await closeDb();
    }
  });
});
