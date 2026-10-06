import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
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

// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("white-label branding (HTTP, local DB)", () => {
  it("default-org rule, public branding exposes only name + logo, logo routes for public / quote / portal", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-branding";
    delete process.env.DEFAULT_ORG_ID;

    const { getDb, closeDb } = await import("../db/index.js");
    const { app } = await import("../app.js");
    const { COOKIE, signSession } = await import("../lib/jwt.js");
    const { signPortalSession } = await import("../lib/portal-jwt.js");
    const PORTAL_COOKIE = "cz_portal";
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { organizations } = await import("../db/schema/tenancy.js");
    const { organizationProfiles } = await import("../db/schema/organization.js");
    const { customers } = await import("../db/schema/crm.js");
    const { resolveDefaultOrganizationId } = await import("./branding.service.js");
    const { uploadRoot } = await import("../lib/storage.js");
    const { asc, eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, DEMO_ORG_ID)).limit(1);
      if (!admin || !cust) return t.skip("no seed data — run db:seed");

      // ---- Which organization the pre-login screens show
      const [first] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.active, true)).orderBy(asc(organizations.createdAt), asc(organizations.id)).limit(1);
      assert.equal(await resolveDefaultOrganizationId(db, ""), first!.id);
      assert.equal(await resolveDefaultOrganizationId(db, "none"), null);
      assert.equal(await resolveDefaultOrganizationId(db, "cangzhan-demo"), DEMO_ORG_ID);
      assert.equal(await resolveDefaultOrganizationId(db, DEMO_ORG_ID), DEMO_ORG_ID);
      assert.equal(await resolveDefaultOrganizationId(db, "no-such-company"), null);
      assert.equal(await resolveDefaultOrganizationId(db, "00000000-0000-4000-8000-000000000000"), null);

      process.env.DEFAULT_ORG_ID = DEMO_ORG_ID;
      const [before] = await db.select({ logoKey: organizationProfiles.logoKey }).from(organizationProfiles).where(eq(organizationProfiles.organizationId, DEMO_ORG_ID)).limit(1);

      const pub = await app.request("http://localhost/api/public/branding");
      assert.equal(pub.status, 200);
      const b0 = (await pub.json()) as Record<string, unknown>;
      assert.deepEqual(Object.keys(b0).sort(), ["logoUrl", "name"]);
      assert.deepEqual(Object.keys(b0.name as object).sort(), ["en", "th", "zh"]);

      // The signed-in logo route still needs a session.
      assert.equal((await app.request("http://localhost/api/organization/logo")).status, 401);

      if (before?.logoKey) {
        t.diagnostic("demo org already has a logo — upload/remove round-trip skipped");
        assert.ok(String(b0.logoUrl).startsWith("/api/public/branding/logo?v="));
        return;
      }
      assert.equal(b0.logoUrl, null);
      assert.equal((await app.request("http://localhost/api/public/branding/logo")).status, 404);

      // ---- Upload a logo as admin → visible publicly, to the portal and on public quotes
      const adminToken = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: DEMO_ORG_ID });
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "logo.png");
      const svg = new FormData();
      svg.append("file", new Blob(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"], { type: "image/svg+xml" }), "x.svg");
      assert.equal((await app.request("http://localhost/api/organization/logo", { method: "POST", headers: { Cookie: `${COOKIE}=${adminToken}` }, body: svg })).status, 415);
      const up = await app.request("http://localhost/api/organization/logo", { method: "POST", headers: { Cookie: `${COOKIE}=${adminToken}` }, body: form });
      assert.equal(up.status, 200);
      try {
        const b1 = (await (await app.request("http://localhost/api/public/branding")).json()) as { logoUrl: string };
        assert.ok(b1.logoUrl.startsWith("/api/public/branding/logo?v="));
        const img = await app.request(`http://localhost${b1.logoUrl}`);
        assert.equal(img.status, 200);
        assert.equal(img.headers.get("content-type"), "image/png");
        assert.equal(img.headers.get("x-content-type-options"), "nosniff");
        assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);

        const portalToken = await signPortalSession({ customerId: cust.id, orgId: DEMO_ORG_ID });
        const me = (await (await app.request("http://localhost/api/portal/me", { headers: { Cookie: `${PORTAL_COOKIE}=${portalToken}` } })).json()) as { branding: { logoUrl: string; name: unknown } };
        assert.ok(me.branding.logoUrl.startsWith("/api/portal/logo?v="));
        assert.equal((await app.request("http://localhost/api/portal/logo", { headers: { Cookie: `${PORTAL_COOKIE}=${portalToken}` } })).status, 200);
        assert.equal((await app.request("http://localhost/api/portal/logo")).status, 401);
        assert.equal((await app.request("http://localhost/api/public/quotes/not-a-token/logo")).status, 404);
      } finally {
        const del = await app.request("http://localhost/api/organization/logo", { method: "DELETE", headers: { Cookie: `${COOKIE}=${adminToken}` } });
        assert.equal(del.status, 200);
      }
      const b2 = (await (await app.request("http://localhost/api/public/branding")).json()) as { logoUrl: string | null };
      assert.equal(b2.logoUrl, null);
    } finally {
      // Logo files written by this test (the profile row no longer points at them).
      const dir = join(uploadRoot(), DEMO_ORG_ID);
      const [p] = await db.select({ logoKey: organizationProfiles.logoKey }).from(organizationProfiles).where(eq(organizationProfiles.organizationId, DEMO_ORG_ID)).limit(1);
      if (existsSync(dir)) {
        for (const f of (await import("node:fs")).readdirSync(dir)) {
          if (f.startsWith("org-logo-") && f !== p?.logoKey && readFileSync(join(dir, f)).equals(PNG)) rmSync(join(dir, f));
        }
      }
      delete process.env.DEFAULT_ORG_ID;
      await closeDb();
    }
  });
});
