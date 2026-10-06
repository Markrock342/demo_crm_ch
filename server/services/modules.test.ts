import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_MODULES_ON,
  MODULE_PRESETS,
  blockingModule,
  normalizeModules,
  presetOf,
  rulesOffByModules,
  type ModuleSet,
} from "../domain/modules.js";
import { RULE_KEYS } from "./automation.service.js";

// This file exercises the gate itself (other API tests run with it off).
process.env.MODULE_GATE = "on";
process.env.MODULES_CACHE_TTL_MS = "0";

const mkcs = MODULE_PRESETS.marketing_cs as ModuleSet;

describe("module switches (pure)", () => {
  it("missing or junk values count as ON; presets are recognised", () => {
    assert.deepEqual(normalizeModules(null), ALL_MODULES_ON);
    assert.deepEqual(normalizeModules({ finance: false, bogus: false, yard: "no" }), { ...ALL_MODULES_ON, finance: false });
    assert.equal(presetOf(ALL_MODULES_ON), "full");
    assert.equal(presetOf(mkcs), "marketing_cs");
    assert.equal(presetOf({ ...ALL_MODULES_ON, yard: false }), null);
  });

  it("finance off blocks invoices, bills, payments, job charges — not login, users, settings, tasks, import", () => {
    for (const p of ["/api/invoices", "/api/invoices/x/pdf", "/api/billing-notes", "/api/payments", "/api/vendor-bills/1/pay", "/api/finance/ar-summary", "/api/jobs/abc/charges", "/api/jobs/abc/financials", "/api/exports/invoices.csv", "/api/bulk/invoices/issue"]) {
      assert.equal(blockingModule("GET", p, mkcs), "finance", p);
    }
    for (const p of ["/api/auth/me", "/api/auth/login", "/api/users", "/api/organization", "/api/organization/modules", "/api/notifications", "/api/tasks", "/api/activities", "/api/import/batches", "/api/customers", "/api/contacts", "/api/mails", "/api/account", "/api/audit-logs", "/api/onboarding/x", "/api/portal/jobs", "/api/public/quotes/t"]) {
      assert.equal(blockingModule("GET", p, mkcs), null, p);
      assert.equal(blockingModule("POST", p, { ...mkcs, sales: false, cs: false, tracking: false, automation: false }), null, p);
    }
  });

  it("vendors stay open while sales is on; docs / automation / cases / sales gate their own paths", () => {
    assert.equal(blockingModule("GET", "/api/vendors", mkcs), null);
    assert.equal(blockingModule("GET", "/api/vendors", { ...mkcs, sales: false }), "finance");
    assert.equal(blockingModule("GET", "/api/docs", mkcs), "docs");
    assert.equal(blockingModule("GET", "/api/document-templates/1/preview", mkcs), "docs");
    assert.equal(blockingModule("GET", "/api/docsearch", mkcs), null);
    assert.equal(blockingModule("POST", "/api/automation/run", { ...ALL_MODULES_ON, automation: false }), "automation");
    assert.equal(blockingModule("GET", "/api/cases", { ...ALL_MODULES_ON, cs: false }), "cs");
    assert.equal(blockingModule("GET", "/api/quotations", { ...ALL_MODULES_ON, sales: false }), "sales");
    assert.equal(blockingModule("GET", "/api/rates/search", { ...ALL_MODULES_ON, sales: false }), "sales");
  });

  it("tracking off: read-only lookups stay open for cs / sales, writes are blocked", () => {
    const off = { ...mkcs, tracking: false };
    assert.equal(blockingModule("GET", "/api/jobs/1", off), null);
    assert.equal(blockingModule("GET", "/api/containers", off), null);
    assert.equal(blockingModule("PATCH", "/api/jobs/1/cutoffs", off), "tracking");
    assert.equal(blockingModule("POST", "/api/bookings", off), "tracking");
    assert.equal(blockingModule("GET", "/api/jobs", { ...off, cs: false, sales: false }), "tracking");
  });

  it("automation skips rules of modules that are off (all of them when automation is off)", () => {
    assert.deepEqual(rulesOffByModules(mkcs, RULE_KEYS).sort(), ["doc_missing", "invoice_overdue"]);
    assert.deepEqual(rulesOffByModules(ALL_MODULES_ON, RULE_KEYS), []);
    assert.equal(rulesOffByModules({ ...ALL_MODULES_ON, automation: false }, RULE_KEYS).length, RULE_KEYS.length);
  });
});

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1]! in process.env)) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

describe("organization modules API (HTTP, throwaway company)", () => {
  it("admin switches presets, the gate answers 403 module_disabled, non-admins cannot change", async (t) => {
    loadDotEnv(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-modules";

    const { app } = await import("../app.js");
    const { COOKIE, signSession } = await import("../lib/jwt.js");
    const { getDb, closeDb } = await import("../db/index.js");
    const { organizations, organizationMembers, users, auditLogs } = await import("../db/schema/index.js");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    if (!db) return t.skip("database unavailable");

    const ORG = "33333333-3333-4333-8333-3333333300a1";
    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      const [sales] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sales@cangzhan.com")).limit(1);
      if (!admin || !sales) return t.skip("no seeded users — run db:seed");
      await db.insert(organizations).values({ id: ORG, slug: "modules-test-a1", name: "Modules Test" }).onConflictDoNothing();
      await db.insert(organizationMembers).values([
        { organizationId: ORG, userId: admin.id, orgRole: "admin" },
        { organizationId: ORG, userId: sales.id, orgRole: "member" },
      ]).onConflictDoNothing();

      const adminTok = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: ORG });
      const salesTok = await signSession({ sub: sales.id, email: "sales@cangzhan.com", roles: ["SALES"], permissions: [], orgId: ORG });
      const call = (tok: string, method: string, path: string, body?: unknown) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });

      const first = (await (await call(adminTok, "GET", "/api/organization/modules")).json()) as { modules: ModuleSet; preset: string };
      assert.deepEqual(first.modules, ALL_MODULES_ON);
      assert.equal(first.preset, "full");

      assert.equal((await call(salesTok, "PATCH", "/api/organization/modules", { preset: "full" })).status, 403);
      assert.equal((await call(adminTok, "PATCH", "/api/organization/modules", { preset: "nope" })).status, 400);
      assert.equal((await call(adminTok, "PATCH", "/api/organization/modules", { modules: { finance: "off" } })).status, 400);

      const set = (await (await call(adminTok, "PATCH", "/api/organization/modules", { preset: "marketing_cs" })).json()) as { modules: ModuleSet; preset: string };
      assert.equal(set.preset, "marketing_cs");
      assert.equal(set.modules.finance, false);

      const blocked = await call(adminTok, "GET", "/api/invoices");
      assert.equal(blocked.status, 403);
      assert.deepEqual(await blocked.json(), { error: "module_disabled", module: "finance" });
      assert.equal((await call(adminTok, "GET", "/api/docs")).status, 403);
      assert.equal((await call(adminTok, "GET", "/api/jobs")).status, 200);
      assert.equal((await call(adminTok, "GET", "/api/tasks")).status, 200);
      assert.equal((await call(adminTok, "GET", "/api/auth/me")).status, 200);
      // Sales read them too (menus).
      assert.equal(((await (await call(salesTok, "GET", "/api/organization/modules")).json()) as { preset: string }).preset, "marketing_cs");

      const one = (await (await call(adminTok, "PATCH", "/api/organization/modules", { modules: { finance: true } })).json()) as { modules: ModuleSet; preset: string | null };
      assert.equal(one.preset, null);
      assert.equal((await call(adminTok, "GET", "/api/invoices")).status, 200);
    } finally {
      await db.delete(auditLogs).where(eq(auditLogs.organizationId, ORG)).catch(() => undefined);
      await db.delete(organizations).where(eq(organizations.id, ORG)).catch(() => undefined);
      await closeDb();
    }
  });
});
