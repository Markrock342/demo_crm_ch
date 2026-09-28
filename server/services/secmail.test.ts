import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMailTransport,
  MailConfigError,
  resolveMailConfig,
  SandboxMailTransport,
  SmtpMailTransport,
  setMailTransportForTests,
  type MailTransport,
  type OutboundMail,
} from "../mail/transport.js";
import { diffValues } from "./audit-query.service.js";
import { normalizeRecipients, extractAddress, textToHtml } from "./outbound-mail.service.js";

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

/** Minimal SMTP catcher (no TLS/auth): records each message's envelope + raw DATA. */
async function startSmtpCatcher() {
  const messages: { from: string; to: string[]; data: string }[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    let buf = "";
    let inData = false;
    let cur = { from: "", to: [] as string[], data: "" };
    sock.write("220 catcher ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          cur.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          messages.push(cur);
          cur = { from: "", to: [], data: "" };
          inData = false;
          sock.write("250 OK queued as test\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") sock.write("250-catcher\r\n250 8BITMIME\r\n");
        else if (cmd === "HELO") sock.write("250 catcher\r\n");
        else if (cmd === "MAIL") {
          cur.from = line.replace(/^MAIL FROM:\s*/i, "");
          sock.write("250 OK\r\n");
        } else if (cmd === "RCPT") {
          cur.to.push(line.replace(/^RCPT TO:\s*/i, ""));
          sock.write("250 OK\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          sock.write("354 go ahead\r\n");
        } else if (cmd === "QUIT") {
          sock.end("221 bye\r\n");
          return;
        } else sock.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    messages,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        server.close(() => r());
      }),
  };
}

describe("mail transport selection", () => {
  it("defaults to the sandbox", () => {
    assert.equal(resolveMailConfig({}).mode, "sandbox");
    assert.equal(resolveMailConfig({ EMAIL_TRANSPORT: "SANDBOX" }).mode, "sandbox");
    assert.ok(createMailTransport({}) instanceof SandboxMailTransport);
  });

  it("selects SMTP with host + from, infers TLS from the port", () => {
    const cfg = resolveMailConfig({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.example.com", MAIL_FROM: "CRM <a@example.com>" });
    assert.equal(cfg.mode, "smtp");
    if (cfg.mode !== "smtp") return;
    assert.equal(cfg.port, 587);
    assert.equal(cfg.secure, false);
    const tls = resolveMailConfig({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "h", MAIL_FROM: "a@b.co", SMTP_PORT: "465" });
    assert.equal(tls.mode === "smtp" && tls.secure, true);
    const forced = resolveMailConfig({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "h", MAIL_FROM: "a@b.co", SMTP_PORT: "2525", SMTP_SECURE: "true" });
    assert.equal(forced.mode === "smtp" && forced.secure, true);
    assert.ok(createMailTransport({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "h2", MAIL_FROM: "a@b.co" }) instanceof SmtpMailTransport);
  });

  it("misconfigured SMTP fails loudly instead of falling back to the sandbox", async () => {
    const cfg = resolveMailConfig({ EMAIL_TRANSPORT: "smtp", SMTP_USER: "u" });
    assert.equal(cfg.mode, "invalid");
    if (cfg.mode === "invalid") assert.deepEqual(cfg.missing.sort(), ["MAIL_FROM", "SMTP_HOST", "SMTP_PASS"]);
    const t = createMailTransport({ EMAIL_TRANSPORT: "smtp" });
    await assert.rejects(t.send({ to: "x@example.com", subject: "s", body: "b" }), (e) => e instanceof MailConfigError);
    assert.equal(resolveMailConfig({ EMAIL_TRANSPORT: "carrier-pigeon" }).mode, "invalid");
  });

  it("delivers through SMTP (local catcher) with a PDF attachment", async () => {
    const catcher = await startSmtpCatcher();
    try {
      const t = createMailTransport({
        EMAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(catcher.port),
        SMTP_SECURE: "false",
        MAIL_FROM: "CRM Test <crm@example.com>",
      });
      const res = await t.send({
        to: ["buyer@example.com"],
        cc: ["cc@example.com"],
        subject: "ใบแจ้งหนี้ / Invoice INV-1",
        body: "Hello",
        html: textToHtml("Hello"),
        attachments: [{ filename: "Invoice-INV-1.pdf", content: new TextEncoder().encode("%PDF-1.4 test"), contentType: "application/pdf" }],
      });
      assert.equal(res.status, "sent");
      assert.equal(res.transport, "smtp");
      assert.equal(catcher.messages.length, 1);
      const m = catcher.messages[0]!;
      assert.match(m.from, /crm@example\.com/);
      assert.deepEqual(m.to.map((x) => x.replace(/[<>]/g, "")).sort(), ["buyer@example.com", "cc@example.com"]);
      assert.match(m.data, /Invoice-INV-1\.pdf/);
      assert.match(m.data, /application\/pdf/);
    } finally {
      await catcher.close();
    }
  });
});

describe("mail helpers", () => {
  it("normalizes recipients and extracts addresses", () => {
    const r = normalizeRecipients([" a@example.com", "A@example.com", "bad", "", "b@x.co"]);
    assert.deepEqual(r.ok, ["a@example.com", "b@x.co"]);
    assert.deepEqual(r.bad, ["bad"]);
    assert.equal(extractAddress("Jane <jane@x.co>"), "jane@x.co");
    assert.equal(extractAddress("webhook"), null);
    assert.match(textToHtml("<b>x</b> https://a.b/c"), /&lt;b&gt;x&lt;\/b&gt; <a href="https:\/\/a\.b\/c">/);
  });
});

describe("audit diff", () => {
  it("lists changed fields and hides secrets", () => {
    const d = diffValues({ name: "A", phone: "1", updatedAt: "x" }, { name: "B", phone: "1", updatedAt: "y" });
    assert.deepEqual(d.changes, [{ field: "name", from: "A", to: "B" }]);
    const c = diffValues(null, { invoiceNumber: "INV-1", passwordHash: "h", total: 10 });
    assert.equal(c.created, true);
    assert.deepEqual(
      c.changes.map((x) => x.field),
      ["invoiceNumber", "total"],
    );
  });
});

describe("staff login lockout + outbound mail (HTTP, local DB)", () => {
  it("locks after 8 failures per email+IP, stores sent/failed mail, audit viewer", async (t) => {
    loadDotEnv(join(root, ".env"));
    if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL not set");
    if (!process.env.JWT_SECRET?.trim()) process.env.JWT_SECRET = "test-jwt-secret-for-secmail";

    const { app } = await import("../app.js");
    const { COOKIE, signSession } = await import("../lib/jwt.js");
    const { getDb, closeDb } = await import("../db/index.js");
    const { DEMO_ORG_ID } = await import("../domain/tenancy.js");
    const { users, auditLogs } = await import("../db/schema/auth.js");
    const { mails } = await import("../db/schema/comms.js");
    const { invoices } = await import("../db/schema/finance.js");
    const { loginAttempts } = await import("../db/schema/security.js");
    const { and, eq, sql } = await import("drizzle-orm");

    const db = getDb();
    if (!db) return t.skip("database unavailable");
    try {
      await db.execute(sql`SELECT 1 FROM login_attempts LIMIT 1`);
    } catch {
      return t.skip("migration 0014 not applied");
    }
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@cangzhan.com")).limit(1);
    const [sales] = await db.select({ id: users.id }).from(users).where(eq(users.email, "sales@cangzhan.com")).limit(1);
    const [inv] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.organizationId, DEMO_ORG_ID)).limit(1);
    if (!admin || !sales || !inv) return t.skip("no seed data — run db:seed");

    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}-${Date.now().toString(36)}`;
    const login = (password: string, fromIp = ip) =>
      app.request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": fromIp },
        body: JSON.stringify({ email: "sales@cangzhan.com", password }),
      });
    const adminToken = await signSession({ sub: admin.id, email: "admin@cangzhan.com", roles: ["SUPER_ADMIN"], permissions: [], orgId: DEMO_ORG_ID });
    const salesToken = await signSession({ sub: sales.id, email: "sales@cangzhan.com", roles: ["SALES"], permissions: [], orgId: DEMO_ORG_ID });
    const call = (token: string, method: string, path: string, body?: unknown) =>
      app.request(`http://localhost${path}`, {
        method,
        headers: { Cookie: `${COOKIE}=${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const mailIds: string[] = [];

    try {
      // ---- Lockout
      for (let i = 1; i <= 8; i++) assert.equal((await login("wrong-password")).status, 401, `failure ${i}`);
      const locked = await login("demo123");
      assert.equal(locked.status, 429, "correct password is refused while locked");
      assert.equal(((await locked.json()) as { error: string }).error, "too_many_attempts");
      assert.ok(Number(locked.headers.get("retry-after")) > 0);
      // Another IP is not affected.
      const other = await login("demo123", `${ip}-b`);
      assert.equal(other.status, 200);
      // Lock is in the DB (works across instances); once expired, attempts count again from 1.
      await db
        .update(loginAttempts)
        .set({ lockedUntil: new Date(Date.now() - 1000), windowStartedAt: new Date(Date.now() - 20 * 60 * 1000) })
        .where(eq(loginAttempts.ip, ip));
      assert.equal((await login("wrong-password")).status, 401);
      const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip));
      assert.equal(row?.failures, 1);
      assert.equal((await login("demo123")).status, 200);
      assert.equal((await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip))).length, 0, "success clears failures");

      // ---- Invoice e-mail: fake transport captures, row stored as sent
      const captured: OutboundMail[] = [];
      const fake: MailTransport = {
        name: "fake",
        async send(m) {
          captured.push(m);
          return { sandboxId: "fake-1", messageId: "fake-1", status: "sent", transport: "fake" };
        },
      };
      setMailTransportForTests(fake);
      const draftRes = await call(adminToken, "GET", `/api/invoices/${inv.id}/email`);
      assert.equal(draftRes.status, 200);
      const draft = (await draftRes.json()) as { subject: string; body: string; attachment: string };
      assert.match(draft.attachment, /\.pdf$/);
      assert.equal((await call(adminToken, "POST", `/api/invoices/${inv.id}/email`, { to: ["nope"], subject: "s", body: "b" })).status, 400);
      assert.equal((await call(adminToken, "GET", `/api/invoices/does-not-exist/email`)).status, 404);
      const ok = await call(adminToken, "POST", `/api/invoices/${inv.id}/email`, { to: ["buyer@example.com"], subject: draft.subject, body: draft.body });
      assert.equal(ok.status, 200);
      const sent = ((await ok.json()) as { outbound: { id: string; status: string; transport: string } }).outbound;
      mailIds.push(sent.id);
      assert.equal(sent.status, "sent");
      assert.equal(sent.transport, "fake");
      assert.equal(captured.length, 1);
      assert.equal(captured[0]!.attachments?.[0]?.contentType, "application/pdf");
      assert.ok((captured[0]!.attachments?.[0]?.content.byteLength ?? 0) > 1000, "real PDF attached");

      // Failing transport → 502 and a "failed" row with the error.
      setMailTransportForTests({
        name: "fake",
        async send() {
          throw new Error("550 mailbox unavailable");
        },
      });
      const bad = await call(adminToken, "POST", `/api/invoices/${inv.id}/email`, { to: ["buyer@example.com"], subject: "s", body: "b" });
      assert.equal(bad.status, 502);
      const failed = ((await bad.json()) as { outbound: { id: string; status: string; error: string } }).outbound;
      mailIds.push(failed.id);
      assert.equal(failed.status, "failed");
      assert.match(failed.error, /550/);
      const [stored] = await db.select().from(mails).where(eq(mails.id, failed.id));
      assert.equal(stored?.direction, "out");
      assert.equal(stored?.deliveryStatus, "failed");

      // Outbound mail never shows up in the inbox list.
      const inbox = (await (await call(adminToken, "GET", "/api/mails")).json()) as { items: { id: string }[] };
      assert.ok(!inbox.items.some((m) => mailIds.includes(m.id)));

      // ---- Audit viewer
      assert.equal((await call(salesToken, "GET", "/api/audit-logs")).status, 403);
      const audit = await call(adminToken, "GET", `/api/audit-logs?entityType=invoice&q=${encodeURIComponent("550 mailbox")}`);
      assert.equal(audit.status, 200);
      const page = (await audit.json()) as { items: { action: string; entityLabel: string | null; user: { id: string } | null }[]; total: number };
      assert.ok(page.total >= 1);
      assert.equal(page.items[0]!.action, "MAIL_FAILED");
      assert.equal(page.items[0]!.user?.id, admin.id);
      assert.ok(page.items[0]!.entityLabel, "record label resolved");
      assert.equal((await call(adminToken, "GET", "/api/audit-logs?from=not-a-date")).status, 400);
      const facets = (await (await call(adminToken, "GET", "/api/audit-logs/facets")).json()) as { users: unknown[]; entityTypes: string[] };
      assert.ok(facets.users.length > 0 && facets.entityTypes.includes("invoice"));
    } finally {
      setMailTransportForTests(null);
      await db.delete(loginAttempts).where(sql`${loginAttempts.ip} LIKE ${`${ip}%`}`);
      await db.delete(auditLogs).where(and(eq(auditLogs.action, "USER_LOGIN_LOCKED"), sql`${auditLogs.newValue}->>'ip' = ${ip}`));
      for (const id of mailIds) {
        await db.delete(mails).where(eq(mails.id, id));
        await db.delete(auditLogs).where(sql`${auditLogs.newValue}->>'mailId' = ${id}`);
      }
      await closeDb();
    }
  });
});
