import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidTourKey } from "./onboarding.service.js";

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

describe("onboarding tour keys", () => {
  it("accepts short slugs and rejects anything else", () => {
    assert.ok(isValidTourKey("role-sales"));
    assert.ok(isValidTourKey("role-admin.v2"));
    assert.ok(!isValidTourKey(""));
    assert.ok(!isValidTourKey("Role-Sales"));
    assert.ok(!isValidTourKey("a/b"));
    assert.ok(!isValidTourKey("x".repeat(65)));
    assert.ok(!isValidTourKey(42));
  });
});

describe("onboarding API (HTTP, local DB)", () => {
  it("stores tour progress per user and survives a new session", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-onboarding";

    const { app } = await import("../app.js");
    const { COOKIE, signSession } = await import("../lib/jwt.js");
    const { getDb, closeDb } = await import("../db/index.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    let sales: { id: string } | undefined;
    let admin: { id: string } | undefined;
    try {
      [sales] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sales@cangzhan.com")).limit(1);
      [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
    } catch (e) {
      return t.skip(`database unavailable: ${e instanceof Error ? e.message : e}`);
    }
    if (!sales || !admin) return t.skip("no seed data — run db:seed");

    const key = `test-${Date.now().toString(36)}`;
    const token = (sub: string, roles: string[]) => signSession({ sub, email: "x@example.com", roles, permissions: [], orgId: DEMO_ORG_ID });
    const call = (tok: string | null, method: string, path: string) =>
      app.request(`http://localhost${path}`, { method, headers: tok ? { Cookie: `${COOKIE}=${tok}` } : {} });

    const salesTok = await token(sales.id, ["SALES"]);
    const adminTok = await token(admin.id, ["SUPER_ADMIN"]);
    try {
      assert.equal((await call(null, "GET", "/api/onboarding")).status, 401);
      assert.equal((await call(salesTok, "PUT", "/api/onboarding/Bad%20Key")).status, 400);

      const put = await call(salesTok, "PUT", `/api/onboarding/${key}`);
      assert.equal(put.status, 200);
      assert.equal(((await put.json()) as { tourKey: string }).tourKey, key);
      // idempotent
      assert.equal((await call(salesTok, "PUT", `/api/onboarding/${key}`)).status, 200);

      // A fresh session (another device) sees the same progress.
      const again = await call(await token(sales.id, ["SALES"]), "GET", "/api/onboarding");
      const { completed } = (await again.json()) as { completed: Record<string, string> };
      assert.ok(completed[key], "progress visible from a new session");

      // Other users are not affected.
      const other = (await (await call(adminTok, "GET", "/api/onboarding")).json()) as { completed: Record<string, string> };
      assert.equal(other.completed[key], undefined);

      assert.equal((await call(salesTok, "DELETE", `/api/onboarding/${key}`)).status, 200);
      const after = (await (await call(salesTok, "GET", "/api/onboarding")).json()) as { completed: Record<string, string> };
      assert.equal(after.completed[key], undefined);
    } finally {
      await call(salesTok, "DELETE", `/api/onboarding/${key}`);
      await closeDb();
    }
  });
});
