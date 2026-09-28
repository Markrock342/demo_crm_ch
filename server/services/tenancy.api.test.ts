import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";

function dbConnectionError(e: unknown): string | null {
  let cur: unknown = e;
  for (let depth = 0; depth < 6 && cur; depth++) {
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (/does not exist|ECONNREFUSED|authentication failed|connect ETIMEDOUT|database unavailable/i.test(msg)) {
      return msg;
    }
    cur = cur instanceof Error ? (cur as Error & { cause?: unknown }).cause : undefined;
  }
  return null;
}

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

describe("tenant API gates", () => {
  it("jobs list requires authentication", async () => {
    const res = await app.request("http://localhost/api/jobs");
    assert.equal(res.status, 401);
  });

  it("quotations list requires authentication", async () => {
    const res = await app.request("http://localhost/api/quotations");
    assert.equal(res.status, 401);
  });

  it("portal jobs requires portal session", async () => {
    const res = await app.request("http://localhost/api/portal/jobs");
    assert.equal(res.status, 401);
  });

  it("mails list requires authentication", async () => {
    const res = await app.request("http://localhost/api/mails");
    assert.equal(res.status, 401);
  });
});

describe("tenant API isolation (HTTP)", () => {
  it("org B session cannot read org A job by id", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) {
      t.skip("DATABASE_URL not set");
      return;
    }
    if (!process.env.JWT_SECRET?.trim()) {
      process.env.JWT_SECRET = "test-jwt-secret-for-isolation";
    }

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { organizations, organizationMembers } = await import("../db/schema/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { jobs } = await import("../db/schema/operations.js");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) {
      t.skip("database unavailable");
      return;
    }

    try {
      const orgB = "22222222-2222-4222-8222-222222222222";
      await db
        .insert(organizations)
        .values({ id: orgB, slug: "isolation-test-b", name: "Isolation Test B" })
        .onConflictDoNothing();

      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      if (!admin) {
        t.skip("no admin user — run db:seed");
        return;
      }

      await db
        .insert(organizationMembers)
        .values({ organizationId: orgB, userId: admin.id, orgRole: "admin" })
        .onConflictDoNothing();

      const [jobRow] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.organizationId, DEMO_ORG_ID)).limit(1);
      if (!jobRow) {
        t.skip("no seeded jobs — run db:seed");
        return;
      }

      const tokenB = await signSession({
        sub: admin.id,
        email: "admin@cangzhan.com",
        roles: ["SUPER_ADMIN"],
        permissions: ["shipment.view"],
        orgId: orgB,
      });

      const res = await app.request(`http://localhost/api/jobs/${jobRow.id}`, {
        headers: { Cookie: `${COOKIE}=${tokenB}` },
      });
      assert.equal(res.status, 404);
    } catch (e) {
      const reason = dbConnectionError(e);
      if (reason) {
        t.skip(`database unavailable: ${reason}`);
        return;
      }
      throw e;
    } finally {
      await closeDb();
    }
  });
});

describe("quotation from rate — tenant scoping (HTTP)", () => {
  it("org B cannot build a quotation from org A's rate lane", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) {
      t.skip("DATABASE_URL not set");
      return;
    }
    if (!process.env.JWT_SECRET?.trim()) {
      process.env.JWT_SECRET = "test-jwt-secret-for-isolation";
    }

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { organizations, organizationMembers } = await import("../db/schema/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { customers } = await import("../db/schema/crm.js");
    const { quotations } = await import("../db/schema/index.js");
    const { rateLanes, rateSheets, vendors } = await import("../db/schema/index.js");
    const { and, eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) {
      t.skip("database unavailable");
      return;
    }

    const orgB = "22222222-2222-4222-8222-222222222222";
    const custB = "isolation-test-b-customer";
    try {
      await db.insert(organizations).values({ id: orgB, slug: "isolation-test-b", name: "Isolation Test B" }).onConflictDoNothing();
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      if (!admin) {
        t.skip("no admin user — run db:seed");
        return;
      }
      await db.insert(organizationMembers).values({ organizationId: orgB, userId: admin.id, orgRole: "admin" }).onConflictDoNothing();

      const [lane] = await db
        .select({ id: rateLanes.id })
        .from(rateLanes)
        .innerJoin(rateSheets, eq(rateLanes.rateSheetId, rateSheets.id))
        .innerJoin(vendors, eq(rateSheets.vendorId, vendors.id))
        .where(eq(vendors.organizationId, DEMO_ORG_ID))
        .limit(1);
      if (!lane) {
        t.skip("no seeded rate lanes — run db:seed");
        return;
      }

      // A customer that really is in org B, so only the lane check can refuse the request.
      await db
        .insert(customers)
        .values({
          id: custB,
          organizationId: orgB,
          nameZh: "B",
          nameTh: "B",
          nameEn: "B",
          cityZh: "-",
          cityTh: "-",
          cityEn: "-",
          laneZh: "-",
          laneTh: "-",
          laneEn: "-",
          owner: "-",
          updated: "-",
        })
        .onConflictDoNothing();

      const tokenB = await signSession({
        sub: admin.id,
        email: "admin@cangzhan.com",
        roles: ["SUPER_ADMIN"],
        permissions: ["quotation.create"],
        orgId: orgB,
      });

      const res = await app.request("http://localhost/api/quotations/from-rate", {
        method: "POST",
        headers: { Cookie: `${COOKIE}=${tokenB}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: custB, rateLaneId: lane.id, quantity: 1 }),
      });
      assert.equal(res.status, 404);
      const made = await db
        .select({ id: quotations.id })
        .from(quotations)
        .where(and(eq(quotations.organizationId, orgB), eq(quotations.customerId, custB)));
      assert.equal(made.length, 0);
    } catch (e) {
      const reason = dbConnectionError(e);
      if (reason) {
        t.skip(`database unavailable: ${reason}`);
        return;
      }
      throw e;
    } finally {
      await db.delete(customers).where(eq(customers.id, custB)).catch(() => undefined);
      await closeDb();
    }
  });
});
