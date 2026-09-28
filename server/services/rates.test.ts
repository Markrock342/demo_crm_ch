import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

describe("rates API (HTTP, local DB)", () => {
  it("creates, lists, edits and expires a tenant-scoped rate", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-rates";

    const { app } = await import("../app.js");
    const { COOKIE, signSession } = await import("../lib/jwt.js");
    const { getDb, closeDb } = await import("../db/index.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { vendors, rateSheets } = await import("../db/schema/commercial.js");
    const { and, eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
    const [sales] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sales@cangzhan.com")).limit(1);
    const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.organizationId, DEMO_ORG_ID)).limit(1);
    if (!admin || !sales || !vendor) return t.skip("no seed data — run db:seed");

    const tok = (sub: string, r: string[]) => signSession({ sub, email: "x@example.com", roles: r, permissions: [], orgId: DEMO_ORG_ID });
    const adminTok = await tok(admin.id, ["SUPER_ADMIN"]);
    const salesTok = await tok(sales.id, ["SALES"]);
    const call = (token: string, method: string, path: string, body?: unknown) =>
      app.request(`http://localhost${path}`, {
        method,
        headers: { Cookie: `${COOKIE}=${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    const today = new Date();
    const later = new Date(today.getTime() + 30 * 86400000);
    const payload = {
      vendorId: vendor.id,
      carrier: "TEST-LINE",
      validFrom: today.toISOString().slice(0, 10),
      validUntil: later.toISOString().slice(0, 10),
      currency: "usd",
      lane: { pol: "thsgz", pod: "CNXMN", containerType: "45HC" },
      charges: [
        { chargeCode: "OCEAN_FREIGHT", side: "BUY", unit: "PER_CONTAINER", unitPrice: 700, currency: "USD" },
        { chargeCode: "OCEAN_FREIGHT", side: "SELL", unit: "PER_CONTAINER", unitPrice: "900", currency: "USD" },
      ],
    };
    let sheetId: string | null = null;
    try {
      assert.equal((await call(salesTok, "POST", "/api/rates", payload)).status, 403);
      assert.equal((await call(adminTok, "POST", "/api/rates", { ...payload, charges: [] })).status, 400);
      assert.equal((await call(adminTok, "POST", "/api/rates", { ...payload, validUntil: "2000-01-01" })).status, 400);
      assert.equal((await call(adminTok, "POST", "/api/rates", { ...payload, vendorId: "nope" })).status, 404);

      const created = await call(adminTok, "POST", "/api/rates", payload);
      assert.equal(created.status, 201);
      const { laneId, sheetId: sid } = (await created.json()) as { laneId: string; sheetId: string };
      sheetId = sid;

      const find = async (token: string) => {
        const res = await call(token, "GET", "/api/rates/search?pol=THSGZ&pod=CNXMN&containerType=45HC");
        const { items } = (await res.json()) as { items: { laneId: string; totalSell: string; totalBuy: string | null; carrier: string }[] };
        return items.find((i) => i.laneId === laneId);
      };
      const row = await find(adminTok);
      assert.ok(row, "new rate is listed");
      assert.equal(Number(row!.totalSell), 900);
      assert.equal(Number(row!.totalBuy), 700);
      const salesRow = await find(salesTok);
      assert.equal(salesRow?.totalBuy, null, "sales does not see buy");

      const lane = (await (await call(adminTok, "GET", `/api/rates/lanes/${laneId}`)).json()) as { sheet: { carrier: string }; charges: unknown[] };
      assert.equal(lane.sheet.carrier, "TEST-LINE");
      assert.equal(lane.charges.length, 2);
      assert.equal((await call(adminTok, "GET", "/api/rates/lanes/does-not-exist")).status, 404);

      assert.equal((await call(salesTok, "PATCH", `/api/rates/lanes/${laneId}`, { carrier: "X" })).status, 403);
      assert.equal((await call(adminTok, "PATCH", `/api/rates/lanes/${laneId}`, { bogus: 1 })).status, 400);
      const patched = await call(adminTok, "PATCH", `/api/rates/lanes/${laneId}`, {
        carrier: "TEST-LINE-2",
        charges: [{ chargeCode: "OCEAN_FREIGHT", side: "SELL", unit: "PER_CONTAINER", unitPrice: 950, currency: "USD" }],
      });
      assert.equal(patched.status, 200);
      const row2 = await find(adminTok);
      assert.equal(row2?.carrier, "TEST-LINE-2");
      assert.equal(Number(row2?.totalSell), 950);

      assert.equal((await call(adminTok, "PATCH", `/api/rates/lanes/${laneId}`, { expire: true })).status, 200);
      assert.equal(await find(adminTok), undefined, "expired rate leaves the search");
    } finally {
      if (sheetId) await db.delete(rateSheets).where(and(eq(rateSheets.id, sheetId)));
      await closeDb();
    }
  });
});
