import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../app.js";
import { COOKIE } from "../lib/jwt.js";
import {
  autoMap,
  cleanCell,
  nameKey,
  normalizeHeader,
  parseBool,
  parseDate,
  parseNumber,
  toGregorianYear,
  validateRow,
} from "../../src/lib/importer.js";

describe("import: Buddhist years and dates", () => {
  it("converts Buddhist-era years", () => {
    assert.equal(toGregorianYear(2569), 2026);
    assert.equal(toGregorianYear(2026), 2026);
  });
  it("reads dd/mm/yyyy with Buddhist or Gregorian years", () => {
    assert.equal(parseDate("15/10/2569").value, "2026-10-15");
    assert.equal(parseDate("15/10/2026").value, "2026-10-15");
    assert.equal(parseDate("1-2-2569").value, "2026-02-01");
    assert.equal(parseDate("๑๕/๑๐/๒๕๖๙").value, "2026-10-15");
    assert.equal(parseDate("2026-10-15").value, "2026-10-15");
    assert.equal(parseDate("2569-10-15").value, "2026-10-15");
    assert.equal(parseDate("15/10/2569 13:30").value, "2026-10-15");
  });
  it("reads month names in Thai and English", () => {
    assert.equal(parseDate("15 ต.ค. 2569").value, "2026-10-15");
    assert.equal(parseDate("15 ตุลาคม 2569").value, "2026-10-15");
    assert.equal(parseDate("15 Oct 2026").value, "2026-10-15");
  });
  it("reads two-digit years (50–99 as Buddhist) with a warning", () => {
    const r = parseDate("15/10/69");
    assert.equal(r.value, "2026-10-15");
    assert.equal(r.warning, "date_short_year");
    assert.equal(parseDate("15/10/26").value, "2026-10-15");
  });
  it("swaps month-first only when it cannot be day-first", () => {
    const r = parseDate("10/25/2026");
    assert.equal(r.value, "2026-10-25");
    assert.equal(r.warning, "date_month_first");
    assert.equal(parseDate("03/04/2026").value, "2026-04-03");
  });
  it("reads Excel serial numbers, including Buddhist-year serials", () => {
    assert.equal(parseDate(46310).value, "2026-10-15");
    // 15/10/2569 typed into a Gregorian Excel is stored as a serial in the year 2569.
    const beSerial = Math.round((Date.UTC(2569, 9, 15) - Date.UTC(1899, 11, 30)) / 86400000);
    assert.equal(parseDate(beSerial).value, "2026-10-15");
  });
  it("rejects impossible dates", () => {
    assert.equal(parseDate("31/02/2569").error, "invalid_date");
    assert.equal(parseDate("hello").error, "invalid_date");
    assert.equal(parseDate("").value, null);
  });
});

describe("import: numbers, text and headers", () => {
  it("parses numbers with commas, currency and Thai digits", () => {
    assert.equal(parseNumber("1,234.50"), 1234.5);
    assert.equal(parseNumber("฿ 500,000"), 500000);
    assert.equal(parseNumber("1,050 USD"), 1050);
    assert.equal(parseNumber("๑,๒๐๐"), 1200);
    assert.equal(parseNumber("(500)"), -500);
    assert.equal(parseNumber(""), null);
    assert.ok(Number.isNaN(parseNumber("abc") as number));
  });
  it("keeps Thai and Chinese text intact", () => {
    assert.equal(cleanCell("  บริษัท สยามเทรด จำกัด "), "บริษัท สยามเทรด จำกัด");
    assert.equal(cleanCell("暹罗贸易有限公司"), "暹罗贸易有限公司");
    assert.equal(normalizeHeader("ชื่อบริษัท (ไทย) *"), "ชื่อบริษัทไทย");
    assert.equal(nameKey("บริษัท สยามเทรด จำกัด"), nameKey("สยามเทรด"));
    assert.equal(nameKey("Siam Trade Co., Ltd."), nameKey("siam trade"));
  });
  it("reads yes/no in three languages", () => {
    assert.equal(parseBool("ใช่"), true);
    assert.equal(parseBool("是"), true);
    assert.equal(parseBool("N"), false);
    assert.equal(parseBool("maybe"), undefined);
  });
  it("maps headers automatically, including translated labels", () => {
    const map = autoMap("customers", ["ชื่อบริษัท (ไทย) *", "Tax ID", "Credit term (days)", "อีเมล", "Unknown col"], { nameTh: ["ชื่อบริษัท (ไทย)"] });
    assert.deepEqual(map, ["nameTh", "taxId", "creditTermDays", "billingEmail", null]);
    assert.deepEqual(autoMap("jobs", ["Customer", "POL", "POD", "ETD", "ETA", "Vessel"]), ["customer", "pol", "pod", "etd", "eta", "vessel"]);
  });
});

describe("import: templates", () => {
  it("maps every template header (th / en / zh) back to its own field", async () => {
    const { IMPORT_ENTITIES, IMPORT_FIELDS } = await import("../../src/lib/importer.js");
    const book = (await import("../../src/i18n-pages/importer.js")).default;
    const labels: Record<string, string[]> = {};
    for (const e of IMPORT_ENTITIES) for (const f of IMPORT_FIELDS[e]) labels[f.key] = (["th", "en", "zh"] as const).map((l) => book[l][`im_f_${f.key}`]!);
    for (const lang of ["th", "en", "zh"] as const) {
      for (const e of IMPORT_ENTITIES) {
        const fields = IMPORT_FIELDS[e];
        const headers = fields.map((f) => `${book[lang][`im_f_${f.key}`]}${f.required ? " *" : ""}`);
        assert.deepEqual(autoMap(e, headers, labels), fields.map((f) => f.key), `${lang} ${e}`);
      }
    }
  });
});

describe("import: row validation", () => {
  it("validates customers (name, tax ID, enums, lists)", () => {
    const ok = validateRow("customers", {
      nameTh: "บริษัท ทดสอบ จำกัด",
      taxId: 105558000014,
      branchNo: 0,
      country: "ไทย",
      currency: "บาท",
      creditLimit: "500,000",
      creditTermDays: "30",
      businessType: "ผู้นำเข้า",
      containerTypes: "40'HC, 20gp",
      pol: "cnsha",
      pod: "THLCH",
    });
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.values.taxId, "0105558000014");
    assert.equal(ok.values.branchNo, null);
    assert.equal(ok.values.country, "TH");
    assert.equal(ok.values.currency, "THB");
    assert.equal(ok.values.creditLimit, 500000);
    assert.equal(ok.values.businessType, "importer");
    assert.deepEqual(ok.values.containerTypes, ["40HC", "20GP"]);
    assert.equal(ok.values.pol, "CNSHA");

    const bad = validateRow("customers", { taxId: "1234567890123", billingEmail: "nope", creditTermDays: "1.5", status: "??" });
    const codes = Object.fromEntries(bad.errors.map((e) => [e.field, e.code]));
    assert.equal(codes.nameTh, "name_required");
    assert.equal(codes.taxId, "invalid_thai_tax_id");
    assert.equal(codes.billingEmail, "invalid_email");
    assert.equal(codes.creditTermDays, "invalid_integer");
    assert.equal(codes.status, "invalid_choice");
  });
  it("validates rates (dates, ports, prices) and fills defaults", () => {
    const r = validateRow("rates", { vendor: "COSCO", pol: "CNSHA", pod: "THLCH", validFrom: "01/10/2569", validUntil: "31/12/2569", sellPrice: "1,050", containerType: "40HQ" });
    assert.deepEqual(r.errors, []);
    assert.equal(r.values.validFrom, "2026-10-01");
    assert.equal(r.values.containerType, "40HC");
    assert.equal(r.values.mode, "SEA_FCL");
    assert.equal(r.values.currency, "USD");
    const bad = validateRow("rates", { vendor: "X", pol: "SHANGHAI", pod: "THLCH", validFrom: "31/12/2569", validUntil: "01/10/2569" });
    const fields = bad.errors.map((e) => `${e.field}:${e.code}`);
    assert.ok(fields.includes("pol:invalid_port"));
    assert.ok(fields.includes("validUntil:before_start"));
    assert.ok(fields.includes("sellPrice:price_required"));
  });
  it("validates jobs and infers direction", () => {
    const r = validateRow("jobs", { customer: "ACME", pol: "CNSHA", pod: "THLCH", etd: "05/10/2569", eta: "12/10/2569", containerType: "40HC", containerCount: "2", status: "จอง" });
    assert.deepEqual(r.errors, []);
    assert.equal(r.values.direction, "IMPORT");
    assert.equal(r.values.status, "BOOKING");
    const bad = validateRow("jobs", { pol: "CNSHA", pod: "THLCH", etd: "12/10/2569", eta: "05/10/2569", status: "DELIVERED" });
    const fields = bad.errors.map((e) => `${e.field}:${e.code}`);
    assert.ok(fields.includes("customer:required"));
    assert.ok(fields.includes("eta:before_etd"));
    assert.ok(fields.includes("status:invalid_choice"));
  });
});

/* ── Bulk endpoints (HTTP, local DB) ─────────────────────────── */

describe("import APIs require a session", () => {
  for (const [method, path] of [
    ["POST", "/api/import/customers"],
    ["GET", "/api/import/batches"],
    ["POST", "/api/import/batches/x/undo"],
  ] as const) {
    it(`${method} ${path} → 401`, async () => {
      const res = await app.request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
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

type Result = {
  batchId: string | null;
  results: { row: number; status: string; id?: string; errors: { field: string; code: string }[]; warnings: { field: string; code: string }[] }[];
  summary: { created: number; ready: number; duplicate: number; error: number };
};

describe("import APIs (HTTP, local DB)", () => {
  it("dry-runs, imports customers + contacts + rates + jobs per batch, flags duplicates, and undoes", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-import";

    const { getDb, closeDb } = await import("../db/index.js");
    const { signSession } = await import("../lib/jwt.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users } = await import("../db/schema/auth.js");
    const { customers, jobs, vendors } = await import("../db/schema/index.js");
    const { importBatches } = await import("../db/schema/imports.js");
    const { eq, inArray } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    const batchIds: string[] = [];
    const tag = `IMPTEST${Date.now().toString(36)}`;
    try {
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
      if (!admin) return t.skip("no seed users — run db:seed");
      const token = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: DEMO_ORG_ID });
      const call = (method: string, path: string, body?: unknown, tok = token) =>
        app.request(`http://localhost${path}`, {
          method,
          headers: { Cookie: `${COOKIE}=${tok}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });

      // Customers: 1 good, 1 bad, 1 in-file duplicate.
      const custRows = [
        { row: 2, data: { nameTh: `บริษัท ${tag} จำกัด`, nameZh: `${tag}有限公司`, creditLimit: "1,000", contactName: "คุณทดสอบ", contactPhone: "0812345678" } },
        { row: 3, data: { nameEn: "", billingEmail: "bad" } },
        { row: 4, data: { nameTh: `${tag}` } },
      ];
      const dry = await call("POST", "/api/import/customers", { fileName: "t.xlsx", dryRun: true, rows: custRows });
      assert.equal(dry.status, 200);
      const dryBody = (await dry.json()) as Result;
      assert.deepEqual(dryBody.results.map((r) => r.status), ["ready", "error", "error"]);
      assert.equal(dryBody.results[2]!.errors[0]!.code, "duplicate_in_file");
      assert.equal(dryBody.batchId, null);
      assert.equal((await db.select().from(customers).where(eq(customers.nameTh, `บริษัท ${tag} จำกัด`))).length, 0, "dry run leaves nothing");

      const res = await call("POST", "/api/import/customers", { fileName: "t.xlsx", rows: custRows.slice(0, 2) });
      assert.equal(res.status, 201);
      const body = (await res.json()) as Result;
      assert.equal(body.summary.created, 1);
      assert.equal(body.summary.error, 1);
      assert.ok(body.batchId);
      batchIds.push(body.batchId!);
      const custId = body.results[0]!.id!;

      // Re-import → duplicate (matched by name, ignoring "บริษัท … จำกัด").
      const again = (await (await call("POST", "/api/import/customers", { rows: [{ row: 2, data: { nameTh: tag } }] })).json()) as Result;
      assert.equal(again.results[0]!.status, "duplicate");
      assert.equal(again.results[0]!.id, custId);
      assert.equal(again.batchId, null);

      // Contacts matched by Chinese name; unknown customer is an error.
      const ct = (await (
        await call("POST", "/api/import/contacts", {
          rows: [
            { row: 2, data: { customer: `${tag}有限公司`, name: "Li Wei", email: "LI@example.com" } },
            { row: 3, data: { customer: "ไม่มีบริษัทนี้ xyz", name: "Nobody" } },
            { row: 4, data: { customer: tag, name: "คุณทดสอบ" } },
          ],
        })
      ).json()) as Result;
      assert.deepEqual(ct.results.map((r) => r.status), ["created", "error", "duplicate"]);
      assert.equal(ct.results[1]!.errors[0]!.code, "customer_not_found");
      batchIds.push(ct.batchId!);

      // Rates: new vendor is created and flagged.
      const rt = (await (
        await call("POST", "/api/import/rates", {
          rows: [{ row: 2, data: { vendor: `${tag} Line`, pol: "CNSHA", pod: "THLCH", validFrom: "01/10/2569", validUntil: "31/12/2569", buyPrice: "850", sellPrice: "1,050", containerType: "40HC" } }],
        })
      ).json()) as Result;
      assert.equal(rt.results[0]!.status, "created");
      assert.ok(rt.results[0]!.warnings.some((w) => w.code === "new_vendor"));
      batchIds.push(rt.batchId!);
      const rtDup = (await (
        await call("POST", "/api/import/rates", {
          dryRun: true,
          rows: [{ row: 2, data: { vendor: `${tag} Line`, pol: "CNSHA", pod: "THLCH", validFrom: "2026-10-01", validUntil: "2026-12-31", sellPrice: "1" , containerType: "40HC" } }],
        })
      ).json()) as Result;
      assert.equal(rtDup.results[0]!.status, "duplicate");

      // Jobs: generated job number, milestones, dates from Buddhist years.
      const jb = (await (
        await call("POST", "/api/import/jobs", {
          rows: [{ row: 2, data: { customer: tag, pol: "CNSHA", pod: "THLCH", etd: "05/10/2569", eta: "12/10/2569", containerType: "40HC", containerCount: 2, vessel: "TEST VESSEL", bookingNumber: `${tag}BK` } }],
        })
      ).json()) as Result;
      assert.equal(jb.results[0]!.status, "created");
      batchIds.push(jb.batchId!);
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jb.results[0]!.id!));
      assert.equal(job!.etd, "2026-10-05");
      assert.equal(job!.teu, 4);
      assert.equal(job!.direction, "IMPORT");
      const jbAgain = (await (
        await call("POST", "/api/import/jobs", {
          dryRun: true,
          rows: [
            { row: 2, data: { customer: tag, pol: "CNSHA", pod: "THLCH", etd: "2026-10-05", vessel: "test vessel" } },
            { row: 3, data: { customer: "nobody xyz", pol: "CNSHA", pod: "THLCH", etd: "12/10/2569", eta: "05/10/2569" } },
          ],
        })
      ).json()) as Result;
      assert.equal(jbAgain.results[0]!.status, "duplicate", "same customer, lane, ETD and vessel");
      assert.deepEqual(jbAgain.results[1]!.errors.map((e) => e.field).sort(), ["customer", "eta"]);

      // Role without rate.create cannot import rates.
      const [ops] = await db.select({ id: users.id }).from(users).where(eq(users.email, "ops@cangzhan.com")).limit(1);
      if (ops) {
        const opsTok = await signSession({ sub: ops.id, email: "ops@cangzhan.com", roles: ["OPERATIONS"], permissions: [], orgId: DEMO_ORG_ID });
        assert.equal((await call("POST", "/api/import/rates", { rows: [{ row: 2, data: {} }] }, opsTok)).status, 403);
        assert.equal((await call("POST", `/api/import/batches/${rt.batchId}/undo`, undefined, opsTok)).status, 403);
      }

      // History lists the batches.
      const hist = (await (await call("GET", "/api/import/batches")).json()) as { items: { id: string; undoable: boolean }[] };
      for (const id of batchIds) assert.ok(hist.items.find((b) => b.id === id)?.undoable, id);

      // Undoing the customer batch first fails: the imported job still points at it.
      const blocked = await call("POST", `/api/import/batches/${batchIds[0]}/undo`);
      assert.equal(blocked.status, 409);
      assert.equal(((await blocked.json()) as { error: string }).error, "in_use");

      // Undo newest first.
      for (const id of [...batchIds].reverse()) {
        const u = await call("POST", `/api/import/batches/${id}/undo`);
        assert.equal(u.status, 200, id);
      }
      assert.equal((await call("POST", `/api/import/batches/${batchIds[0]}/undo`)).status, 409, "already undone");
      assert.equal((await db.select().from(customers).where(eq(customers.id, custId))).length, 0);
      assert.equal((await db.select().from(vendors).where(eq(vendors.company, `${tag} Line`))).length, 0);

      // The undo window closes after 24 hours.
      const { undoImportBatch, ImportUndoError } = await import("./import.service.js");
      const late = (await (await call("POST", "/api/import/customers", { rows: [{ row: 2, data: { nameEn: `${tag} late` } }] })).json()) as Result;
      batchIds.push(late.batchId!);
      await assert.rejects(undoImportBatch(db, DEMO_ORG_ID, late.batchId!, admin.id, new Date(Date.now() + 25 * 3600000)), (e) => e instanceof ImportUndoError && e.code === "expired");
      await undoImportBatch(db, DEMO_ORG_ID, late.batchId!, admin.id);
    } catch (e) {
      const down = isDbDown(e);
      if (down) return t.skip(`database unavailable: ${down}`);
      throw e;
    } finally {
      if (batchIds.length) await db.delete(importBatches).where(inArray(importBatches.id, batchIds)).catch(() => undefined);
      await closeDb();
    }
  });
});
