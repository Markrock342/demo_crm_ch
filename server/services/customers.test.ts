import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { customerCreateSchema, normalizeContacts, resolveNames, taxIdError } from "../domain/customer.js";
import { isValidThaiTaxId, normalizeBranchNo } from "../../src/lib/customerProfile.js";

describe("Thai tax ID", () => {
  it("accepts a valid 13-digit ID (with or without dashes) and rejects bad check digits", () => {
    assert.equal(isValidThaiTaxId("0105536012345"), false);
    assert.equal(isValidThaiTaxId("0105558000014"), true);
    assert.equal(isValidThaiTaxId("0-1055-58000-01-4"), true);
    assert.equal(isValidThaiTaxId("0105558000012"), false);
    assert.equal(isValidThaiTaxId("12345"), false);
  });
  it("only enforces the Thai rule when the country is Thailand", () => {
    assert.equal(taxIdError("91440300MA5F", "CN"), null);
    assert.equal(taxIdError("91440300MA5F", "TH"), "invalid_thai_tax_id");
    assert.equal(taxIdError("91440300MA5F", null), "invalid_thai_tax_id");
    assert.equal(taxIdError(null, "TH"), null);
  });
  it("normalizes branch numbers (head office = null)", () => {
    assert.equal(normalizeBranchNo("00000"), null);
    assert.equal(normalizeBranchNo(""), null);
    assert.equal(normalizeBranchNo("12"), "00012");
    assert.equal(normalizeBranchNo("00003"), "00003");
  });
});

describe("customer input", () => {
  it("needs at least one company name", () => {
    const r = customerCreateSchema.safeParse({ nameTh: "  ", nameZh: "" });
    assert.equal(r.success, false);
    assert.ok(!r.success && r.error.issues.some((i) => i.message === "name_required"));
    assert.equal(customerCreateSchema.safeParse({ nameEn: "Acme" }).success, true);
  });
  it("fills missing names from typed ones and records which were typed", () => {
    assert.deepEqual(resolveNames({ nameTh: "บริษัท ก", nameEn: null, nameZh: null }), {
      nameZh: "บริษัท ก",
      nameTh: "บริษัท ก",
      nameEn: "บริษัท ก",
      nameLangs: "th",
    });
    const r = resolveNames({ nameTh: "บริษัท ก", nameEn: "Kor Co.", nameZh: null });
    assert.equal(r.nameZh, "Kor Co.");
    assert.equal(r.nameLangs, "th,en");
  });
  it("validates emails, lanes, enums and tax ID against country", () => {
    const bad = customerCreateSchema.safeParse({
      nameEn: "X",
      billingEmail: "nope",
      preferredLanes: [{ pol: "CNSHA", pod: "CNSHA" }],
      containerTypes: ["99ZZ"],
    });
    assert.equal(bad.success, false);
    const paths = !bad.success ? bad.error.issues.map((i) => i.path.join(".")) : [];
    for (const p of ["billingEmail", "preferredLanes.0", "containerTypes.0"]) assert.ok(paths.includes(p), p);
    const tax = customerCreateSchema.safeParse({ nameEn: "X", taxId: "0105558000015", country: "TH" });
    assert.ok(!tax.success && tax.error.issues.some((i) => i.path.join(".") === "taxId"));
    assert.equal(customerCreateSchema.safeParse({ nameEn: "X", taxId: "0105558000015", country: "CN" }).success, true);

    const ok = customerCreateSchema.parse({
      nameEn: "X",
      taxId: "0-1055-58000-01-4",
      branchNo: "1",
      creditLimit: "500000",
      preferredLanes: [{ pol: "cnsha", pod: "thlch" }],
      containerTypes: ["40HC", "40HC", "20GP"],
    });
    assert.equal(ok.taxId, "0105558000014");
    assert.equal(ok.branchNo, "00001");
    assert.equal(ok.creditLimit, "500000.00");
    assert.deepEqual(ok.preferredLanes, [{ pol: "CNSHA", pod: "THLCH" }]);
    assert.deepEqual(ok.containerTypes, ["40HC", "20GP"]);
  });
  it("keeps exactly one primary contact", () => {
    assert.deepEqual(
      normalizeContacts([{ name: "a" }, { name: "b" }]).map((c) => c.primary),
      [true, false],
    );
    assert.deepEqual(
      normalizeContacts([{ name: "a" }, { name: "b", primary: true }, { name: "c", primary: true }]).map((c) => c.primary),
      [false, true, false],
    );
  });
});

describe("customer APIs require a session", () => {
  for (const [method, path] of [
    ["POST", "/api/customers"],
    ["PATCH", "/api/customers/x"],
    ["GET", "/api/contacts"],
    ["PATCH", "/api/contacts/x"],
    ["DELETE", "/api/contacts/x"],
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

type CustomerBody = {
  id: string;
  nameTh: string;
  nameZh: string;
  nameLangs: string[];
  owner: string;
  ownerUserId: string | null;
  taxId: string | null;
  creditTermDays: number | null;
  creditLimit: number | null;
  preferredLanes: { pol: string; pod: string }[];
  laneZh: string;
  status: string;
  contacts: { id: string; name: string; primary: boolean; lineId: string }[];
};

describe("customer APIs (HTTP, local DB)", () => {
  it("creates a full customer with contacts, patches it, syncs contacts and enforces permissions", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-customers";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { deleteCustomer } = await import("./crm.service.js");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    let createdId: string | undefined;
    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      const [sales] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sales@cangzhan.com")).limit(1);
      if (!admin || !sales) return t.skip("no seed users — run db:seed");

      const token = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: DEMO_ORG_ID });
      const call = (method: string, path: string, body?: unknown, tok = token) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${tok}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      const bad = await call("POST", "/api/customers", { nameTh: "", taxId: "1234567890123", country: "TH" });
      assert.equal(bad.status, 400);
      const badBody = (await bad.json()) as { issues: { path: string; message: string }[] };
      assert.ok(badBody.issues.some((i) => i.path === "name"));
      assert.ok(badBody.issues.some((i) => i.path === "taxId" && i.message === "invalid_thai_tax_id"));

      const res = await call("POST", "/api/customers", {
        nameTh: "TEST — ลบได้ (customers.test)",
        businessType: "importer",
        ownerUserId: sales.id,
        status: "active",
        taxId: "0105558000014",
        branchNo: "",
        country: "TH",
        currency: "THB",
        creditTermDays: 30,
        creditLimit: 250000,
        billingEmail: "ap@example.com",
        preferredLanes: [{ pol: "CNSHA", pod: "THLCH" }],
        containerTypes: ["40HC"],
        customsBroker: true,
        contacts: [
          { name: "Somchai", email: "s@example.com", lineId: "somchai.l" },
          { name: "Li Wei", wechat: "liwei88", primary: true },
        ],
      });
      assert.equal(res.status, 201);
      const created = (await res.json()) as CustomerBody;
      createdId = created.id;
      assert.equal(created.nameZh, created.nameTh);
      assert.deepEqual(created.nameLangs, ["th"]);
      assert.equal(created.ownerUserId, sales.id);
      assert.equal(created.owner, "周可");
      assert.equal(created.creditLimit, 250000);
      assert.equal(created.laneZh, "CNSHA → THLCH");
      assert.equal(created.contacts.length, 2);
      assert.equal(created.contacts.filter((p) => p.primary).length, 1);
      assert.equal(created.contacts.find((p) => p.primary)!.name, "Li Wei");
      assert.equal(created.contacts.find((p) => p.name === "Somchai")!.lineId, "somchai.l");

      // Patch: change credit term, add English name, keep one contact, add a new one.
      const somchai = created.contacts.find((p) => p.name === "Somchai")!;
      const patch = await call("PATCH", `/api/customers/${created.id}`, {
        nameEn: "Test Delete Me Co.",
        creditTermDays: 45,
        status: "on_hold",
        contacts: [{ id: somchai.id, name: "Somchai K.", primary: true }, { name: "Nok" }],
      });
      assert.equal(patch.status, 200);
      const patched = (await patch.json()) as CustomerBody;
      assert.equal(patched.creditTermDays, 45);
      assert.equal(patched.status, "on_hold");
      assert.equal(patched.taxId, "0105558000014"); // untouched
      assert.deepEqual(patched.nameLangs, ["th", "en"]);
      assert.equal(patched.contacts.length, 2);
      assert.equal(patched.contacts.find((p) => p.id === somchai.id)?.name, "Somchai K.");
      assert.ok(!patched.contacts.some((p) => p.name === "Li Wei"));

      // Clearing all names is rejected; an owner from outside the org is rejected.
      const noName = await call("PATCH", `/api/customers/${created.id}`, { nameTh: "", nameEn: "" });
      assert.equal(noName.status, 400);
      const foreign = await call("PATCH", `/api/customers/${created.id}`, { ownerUserId: "00000000-0000-4000-8000-000000000000" });
      assert.equal(foreign.status, 400);

      // Contact endpoints.
      const nok = patched.contacts.find((p) => p.name === "Nok")!;
      const up = await call("PATCH", `/api/contacts/${nok.id}`, { primary: true, phone: "081" });
      assert.equal(up.status, 200);
      const list = (await (await call("GET", `/api/contacts?customerId=${created.id}`)).json()) as { items: CustomerBody["contacts"] };
      assert.equal(list.items.filter((p) => p.primary).length, 1);
      assert.equal(list.items[0]!.id, nok.id);
      assert.equal((await call("DELETE", `/api/contacts/${nok.id}`)).status, 200);

      // Roles without customer.create / customer.edit are refused.
      const [ops] = await db.select({ id: users.id }).from(users).where(eq(users.email, "ops@cangzhan.com")).limit(1);
      if (ops) {
        const opsTok = await signSession({ sub: ops.id, email: "ops@cangzhan.com", roles: ["OPERATIONS"], permissions: [], orgId: DEMO_ORG_ID });
        assert.equal((await call("POST", "/api/customers", { nameEn: "nope" }, opsTok)).status, 403);
        assert.equal((await call("PATCH", `/api/customers/${created.id}`, { notes: "x" }, opsTok)).status, 403);
      }
    } catch (e) {
      const down = isDbDown(e);
      if (down) return t.skip(`database unavailable: ${down}`);
      throw e;
    } finally {
      if (createdId) await deleteCustomer(db, DEMO_ORG_ID, createdId).catch(() => undefined);
      await closeDb();
    }
  });
});
