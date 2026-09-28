import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import { embedPdfFonts, fitText, toRuns, wrapText } from "../lib/pdf-text.js";
import { sniffImageType } from "./organization.service.js";
import { generateTempPassword, isSessionStale, passwordProblem } from "./users.service.js";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hasTool(name: string) {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** FontName entries of every font embedded in a PDF. */
async function embeddedFontNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const s = obj.toString();
    const m = s.match(/\/FontName \/([^\s/>]+)/);
    if (m) names.push(m[1]!);
  }
  return names;
}

describe("password rules", () => {
  it("requires 8+ chars with letters and digits, rejects common / email-based ones", () => {
    assert.equal(passwordProblem("short1"), "password_too_short");
    assert.equal(passwordProblem("onlyletters"), "password_needs_letter_and_digit");
    assert.equal(passwordProblem("1234567890"), "password_needs_letter_and_digit");
    assert.equal(passwordProblem("Password123"), "password_too_common");
    assert.equal(passwordProblem("somchai2026x", "somchai@example.com"), "password_contains_email");
    assert.equal(passwordProblem("รหัสผ่านใหม่2026"), null); // Thai letters count as letters
    assert.equal(passwordProblem("Harbour-Lane-42"), null);
    assert.equal(passwordProblem("a1".repeat(70)), "password_too_long");
  });

  it("generates strong temporary passwords", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      assert.equal(p.length, 12);
      assert.equal(passwordProblem(p), null);
      assert.ok(!/[0O1lI]/.test(p), "no look-alike characters");
      seen.add(p);
    }
    assert.equal(seen.size, 50);
  });

  it("treats sessions issued before a password change as stale", () => {
    const changed = new Date("2026-09-28T10:00:00.500Z");
    const at = Math.floor(changed.getTime() / 1000);
    assert.equal(isSessionStale(at - 1, changed), true);
    assert.equal(isSessionStale(at, changed), false);
    assert.equal(isSessionStale(at + 60, changed), false);
    assert.equal(isSessionStale(at - 999, null), false);
    assert.equal(isSessionStale(undefined, changed), true);
  });
});

describe("logo type sniffing", () => {
  it("accepts PNG / JPEG magic bytes only", () => {
    assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(sniffImageType(new TextEncoder().encode("<svg></svg>")), null);
  });
});

describe("PDF Unicode text", () => {
  it("splits Latin / Thai / Chinese into font runs and wraps without breaking Thai marks", async () => {
    const pdf = await PDFDocument.create();
    const fonts = await embedPdfFonts(pdf);
    const runs = toRuns(fonts, "Ocean freight ค่าขนส่ง 海运费 40HC");
    assert.deepEqual(
      runs.map((r) => [r.text, r.font === fonts.th ? "th" : "sc"]),
      [
        ["Ocean freight ", "sc"],
        ["ค่าขนส่ง", "th"],
        [" 海运费 40HC", "sc"],
      ],
    );
    // A glyph no bundled font has becomes "?" instead of throwing.
    assert.equal(toRuns(fonts, "A\u{1F600}B")[0]!.text, "A?B");

    const lines = wrapText(fonts, "ค่าธรรมเนียมเอกสารและค่าบริการพิธีการศุลกากรขาเข้าท่าเรือแหลมฉบัง", 9, 120);
    assert.ok(lines.length > 1);
    assert.equal(lines.join(""), "ค่าธรรมเนียมเอกสารและค่าบริการพิธีการศุลกากรขาเข้าท่าเรือแหลมฉบัง");
    for (const l of lines) assert.ok(!/^[ัิ-ฺ็-๎]/.test(l), `line starts with a mark: ${l}`);
    assert.ok(fitText(fonts, "上海沧栈国际货运代理有限公司 Shanghai Cangzhan International", 10, 100).endsWith("…"));
  });
});

describe("admin APIs (HTTP, local DB)", () => {
  it("company profile, user management, change password, session revoke and Thai/Chinese PDF", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-admin";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { organizations, organizationMembers } = await import("../db/schema/tenancy.js");
    const { customers } = await import("../db/schema/crm.js");
    const { invoices } = await import("../db/schema/finance.js");
    const { eq } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const stamp = Date.now().toString(36);
    const testEmail = `admin-test-${stamp}@example.com`;
    const tempOrgId = crypto.randomUUID();
    const cleanup: { userId?: string; invoiceId?: string; orgPatched?: Record<string, unknown>; tempOrg?: boolean } = {};

    const call = (token: string | null, method: string, path: string, body?: unknown) =>
      app.request(`http://localhost${path}`, {
        method,
        headers: { ...(token ? { Cookie: `${COOKIE}=${token}` } : {}), "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const cookieFrom = (res: Response) => res.headers.get("set-cookie")?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1] ?? null;

    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      const [sales] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sales@cangzhan.com")).limit(1);
      const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.organizationId, DEMO_ORG_ID)).limit(1);
      if (!admin || !sales || !cust) return t.skip("no seed data — run db:seed");
      const adminToken = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: DEMO_ORG_ID });
      const salesToken = await signSession({ sub: sales.id, email: "sales@cangzhan.com", roles: ["SALES"], permissions: [], orgId: DEMO_ORG_ID });

      // ---- Company profile
      assert.equal((await call(null, "GET", "/api/organization")).status, 401);
      const orgRes = await call(salesToken, "GET", "/api/organization");
      assert.equal(orgRes.status, 200);
      const { organization: org0 } = (await orgRes.json()) as { organization: Record<string, unknown> };
      assert.equal(org0.id, DEMO_ORG_ID);
      assert.equal((await call(salesToken, "PATCH", "/api/organization", { nameTh: "x" })).status, 403);
      assert.equal((await call(adminToken, "PATCH", "/api/organization", { taxId: "ABC" })).status, 400);
      assert.equal((await call(adminToken, "PATCH", "/api/organization", { unknown: 1 })).status, 400);
      cleanup.orgPatched = {
        nameTh: org0.nameTh ?? null,
        nameZh: org0.nameZh ?? null,
        bankName: org0.bankName ?? null,
        bankAccountNo: org0.bankAccountNo ?? null,
        invoiceFooter: org0.invoiceFooter ?? null,
      };
      const patched = await call(adminToken, "PATCH", "/api/organization", {
        nameTh: "บริษัท ชางจ้าน ฟอร์เวิร์ดดิ้ง จำกัด",
        nameZh: "沧栈国际货运代理有限公司",
        bankName: "ธนาคารกสิกรไทย",
        bankAccountNo: "123-4-56789-0",
        invoiceFooter: "กรุณาชำระภายในกำหนด 请按期付款",
      });
      assert.equal(patched.status, 200);
      const { organization: org1 } = (await patched.json()) as { organization: Record<string, unknown> };
      assert.equal(org1.nameTh, "บริษัท ชางจ้าน ฟอร์เวิร์ดดิ้ง จำกัด");
      assert.equal(org1.bankAccountNo, "123-4-56789-0");

      // ---- Thai / Chinese invoice PDF
      const inv = await call(adminToken, "POST", "/api/invoices", {
        customerId: cust.id,
        currency: "THB",
        notes: "หมายเหตุ: ชำระผ่านโอน 备注：银行转账",
        lines: [
          { description: "ค่าขนส่งทางทะเล 40HC", qty: 1, unitPrice: 25000 },
          { description: "海运费 上海→林查班", qty: 2, unitPrice: 1200, taxCode: "VAT7" },
        ],
      });
      assert.equal(inv.status, 201);
      const invBody = (await inv.json()) as { id: string };
      cleanup.invoiceId = invBody.id;
      const pdfRes = await call(adminToken, "GET", `/api/invoices/${invBody.id}/pdf`);
      assert.equal(pdfRes.status, 200);
      const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
      const fontNames = await embeddedFontNames(pdfBytes);
      assert.ok(fontNames.some((n) => n.includes("NotoSansThai")), `fonts: ${fontNames.join(", ")}`);
      assert.ok(fontNames.some((n) => n.includes("NotoSansSC")), `fonts: ${fontNames.join(", ")}`);
      if (hasTool("pdftotext")) {
        const dir = mkdtempSync(join(tmpdir(), "cz-pdf-"));
        writeFileSync(join(dir, "inv.pdf"), pdfBytes);
        const txt = execFileSync("pdftotext", ["-layout", join(dir, "inv.pdf"), "-"], { encoding: "utf8" });
        for (const needle of ["ใบแจ้งหนี้", "发票", "ค่าขนส่งทางทะเล", "海运费", "沧栈国际货运代理有限公司", "123-4-56789-0", "请按期付款"]) {
          assert.ok(txt.includes(needle), `PDF text is missing "${needle}"`);
        }
      }

      // ---- User management (admin only)
      assert.equal((await call(salesToken, "POST", "/api/users", { email: testEmail, name: "x", role: "SALES" })).status, 403);
      assert.equal((await call(adminToken, "POST", "/api/users", { email: testEmail, name: "x", role: "PILOT" })).status, 400);
      assert.equal(
        (await call(adminToken, "POST", "/api/users", { email: testEmail, name: "x", role: "SALES", password: "weak" })).status,
        400,
      );
      const createdRes = await call(adminToken, "POST", "/api/users", {
        email: testEmail.toUpperCase(),
        name: "Test Operator",
        nameTh: "ผู้ทดสอบ ระบบ",
        nameZh: "测试员",
        role: "OPERATIONS",
      });
      assert.equal(createdRes.status, 201);
      const created = (await createdRes.json()) as { user: { id: string; email: string; roles: string[]; active: boolean }; tempPassword: string };
      cleanup.userId = created.user.id;
      assert.equal(created.user.email, testEmail);
      assert.deepEqual(created.user.roles, ["OPERATIONS"]);
      assert.equal(passwordProblem(created.tempPassword), null);
      assert.equal((await call(adminToken, "POST", "/api/users", { email: testEmail, name: "dup", role: "SALES" })).status, 409);

      const listed = (await (await call(adminToken, "GET", "/api/users?all=1")).json()) as { items: Array<{ id: string; passwordHash?: string }> };
      assert.ok(listed.items.some((u) => u.id === created.user.id && !("passwordHash" in u)));

      const upd = await call(adminToken, "PATCH", `/api/users/${created.user.id}`, { role: "ACCOUNTING", nameZh: "测试会计" });
      assert.equal(upd.status, 200);
      assert.deepEqual(((await upd.json()) as { user: { roles: string[] } }).user.roles, ["ACCOUNTING"]);
      assert.equal((await call(adminToken, "PATCH", `/api/users/${admin.id}`, { active: false })).status, 409);

      // ---- Log in as the new user and change the password
      const login = await call(null, "POST", "/api/auth/login", { email: testEmail, password: created.tempPassword });
      assert.equal(login.status, 200);
      const firstToken = cookieFrom(login)!;
      assert.ok(firstToken);
      await sleep(1100); // JWT iat has 1 s resolution
      const deviceB = await call(null, "POST", "/api/auth/login", { email: testEmail, password: created.tempPassword });
      const otherDevice = cookieFrom(deviceB)!;
      await sleep(1100);

      const wrong = await call(firstToken, "POST", "/api/account/password", { currentPassword: "nope", newPassword: "Harbour-Lane-42" });
      assert.deepEqual(await wrong.json(), { error: "wrong_password" });
      const weak = await call(firstToken, "POST", "/api/account/password", { currentPassword: created.tempPassword, newPassword: "abc" });
      assert.deepEqual(await weak.json(), { error: "password_too_short" });
      const changed = await call(firstToken, "POST", "/api/account/password", {
        currentPassword: created.tempPassword,
        newPassword: "Harbour-Lane-42",
      });
      assert.equal(changed.status, 200);
      const freshToken = cookieFrom(changed)!;
      assert.ok(freshToken, "the device that changed the password gets a fresh session");
      assert.equal((await call(freshToken, "GET", "/api/auth/me")).status, 200);
      assert.equal((await call(otherDevice, "GET", "/api/auth/me")).status, 401, "other devices are signed out");
      assert.equal((await call(null, "POST", "/api/auth/login", { email: testEmail, password: created.tempPassword })).status, 401);
      assert.equal((await call(null, "POST", "/api/auth/login", { email: testEmail, password: "Harbour-Lane-42" })).status, 200);

      const acc = await call(freshToken, "PATCH", "/api/account", { name: "Test Operator 2", nameTh: "ผู้ทดสอบ", nameZh: "测试" });
      assert.equal(((await acc.json()) as { account: { nameTh: string } }).account.nameTh, "ผู้ทดสอบ");
      assert.equal((await call(freshToken, "POST", "/api/users", { email: "x@example.com", name: "x", role: "SALES" })).status, 403);

      // ---- Admin reset password signs the user out
      await sleep(1100);
      const reset = await call(adminToken, "POST", `/api/users/${created.user.id}/reset-password`, {});
      const { tempPassword: resetPw } = (await reset.json()) as { tempPassword: string };
      assert.equal(passwordProblem(resetPw), null);
      assert.equal((await call(freshToken, "GET", "/api/auth/me")).status, 401);
      assert.equal((await call(null, "POST", "/api/auth/login", { email: testEmail, password: resetPw })).status, 200);

      // ---- Deactivate / reactivate
      const off = await call(adminToken, "PATCH", `/api/users/${created.user.id}`, { active: false });
      assert.equal(((await off.json()) as { user: { active: boolean } }).user.active, false);
      assert.equal((await call(null, "POST", "/api/auth/login", { email: testEmail, password: resetPw })).status, 401);
      const active = (await (await call(adminToken, "GET", "/api/users")).json()) as { items: Array<{ id: string }> };
      assert.ok(!active.items.some((u) => u.id === created.user.id), "default list hides deactivated users");
      const on = await call(adminToken, "PATCH", `/api/users/${created.user.id}`, { active: true });
      assert.equal(((await on.json()) as { user: { active: boolean } }).user.active, true);

      // ---- Last admin guard: in a one-person org the only admin can't demote or deactivate themselves
      await db.insert(organizations).values({ id: tempOrgId, slug: `admin-test-${stamp}`, name: "Admin test org" });
      cleanup.tempOrg = true;
      await call(adminToken, "PATCH", `/api/users/${created.user.id}`, { role: "SUPER_ADMIN" });
      await db.insert(organizationMembers).values({ organizationId: tempOrgId, userId: created.user.id, orgRole: "owner" });
      const soloToken = await signSession({ sub: created.user.id, email: testEmail, roles: ["SUPER_ADMIN"], permissions: [], orgId: tempOrgId });
      const demote = await call(soloToken, "PATCH", `/api/users/${created.user.id}`, { role: "SALES" });
      assert.equal(demote.status, 409);
      assert.deepEqual(await demote.json(), { error: "last_admin" });
      assert.equal((await call(soloToken, "PATCH", `/api/users/${created.user.id}`, { active: false })).status, 409);
      // Cross-tenant: org C's admin can't touch a DEMO org user.
      assert.equal((await call(soloToken, "PATCH", `/api/users/${sales.id}`, { role: "VIEWER" })).status, 404);
    } catch (e) {
      const reason = isDbDown(e);
      if (reason) return t.skip(`database unavailable: ${reason}`);
      throw e;
    } finally {
      if (cleanup.orgPatched) {
        const { updateOrganizationProfile } = await import("./organization.service.js");
        const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
        if (admin) await updateOrganizationProfile(db, DEMO_ORG_ID, admin.id, cleanup.orgPatched as never);
      }
      if (cleanup.invoiceId) await db.delete(invoices).where(eq(invoices.id, cleanup.invoiceId));
      if (cleanup.tempOrg) await db.delete(organizations).where(eq(organizations.id, tempOrgId));
      if (cleanup.userId) await db.delete(users).where(eq(users.id, cleanup.userId));
      await closeDb();
    }
  });
});
