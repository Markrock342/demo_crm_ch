import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { mails } from "../db/schema/comms.js";
import { contacts, customers } from "../db/schema/crm.js";
import { quotations } from "../db/schema/commercial.js";
import { billingNotes, invoices } from "../db/schema/finance.js";
import { createMailTransport, mailFromAddress, MailConfigError, type MailAttachment } from "../mail/transport.js";
import { writeAudit } from "./audit.service.js";
import { getOrganizationProfile } from "./organization.service.js";
import { verifyAccessCode } from "./portal-access.service.js";

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export function isEmail(v: string | null | undefined): v is string {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
}

/** Trims, lower-cases the domain, dedupes; returns invalid entries separately. */
export function normalizeRecipients(list: readonly string[]) {
  const ok: string[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const v = raw.trim();
    if (!v) continue;
    if (!isEmail(v)) {
      bad.push(v);
      continue;
    }
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ok.push(v);
  }
  return { ok, bad };
}

/** Extracts "a@b.c" out of `Name <a@b.c>`. */
export function extractAddress(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/<([^>]+)>/);
  const addr = (m ? m[1]! : v).trim();
  return isEmail(addr) ? addr : null;
}

export type OutboundRecord = {
  id: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  status: "sent" | "failed";
  error: string | null;
  transport: string | null;
  sentAt: string | null;
  createdAt: string;
  sentBy: string | null;
  entityType: string | null;
  entityId: string | null;
  customerId: string | null;
  attachments: { filename: string; size: number }[];
};

function splitAddr(v: string | null) {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function toRecord(row: typeof mails.$inferSelect): OutboundRecord {
  return {
    id: row.id,
    to: splitAddr(row.toAddr),
    cc: splitAddr(row.ccAddr),
    subject: row.subjectEn || row.subjectTh || row.subjectZh,
    body: row.bodyEn || row.bodyTh || row.bodyZh,
    status: row.deliveryStatus === "sent" ? "sent" : "failed",
    error: row.deliveryError,
    transport: row.transport,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    sentBy: row.sentBy,
    entityType: row.entityType,
    entityId: row.entityId,
    customerId: row.customerId,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

export type SendInput = {
  organizationId: string;
  userId: string | null;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  customerId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  inReplyTo?: string | null;
};

function errorText(e: unknown): string {
  if (e instanceof MailConfigError) return `smtp_not_configured: missing ${e.missing.join(", ")}`;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 500) || "send_failed";
}

/**
 * Sends one e-mail through the configured transport and stores it in `mails` (direction "out")
 * with delivery_status sent / failed. Never throws for delivery errors — check `status`.
 */
export async function sendAndRecord(db: Db, input: SendInput): Promise<OutboundRecord> {
  const id = `mo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const transport = createMailTransport();
  const now = new Date();
  let status: "sent" | "failed" = "sent";
  let error: string | null = null;
  let messageId: string | null = null;
  try {
    const res = await transport.send({
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: input.text,
      html: input.html,
      attachments: input.attachments,
      mailId: id,
      customerId: input.customerId ?? undefined,
    });
    messageId = res.messageId || null;
  } catch (e) {
    status = "failed";
    error = errorText(e);
    console.warn(`[mail] send failed (${transport.name}): ${error}`);
  }

  const [row] = await db
    .insert(mails)
    .values({
      id,
      organizationId: input.organizationId,
      customerId: input.customerId || null,
      fromAddr: mailFromAddress(),
      subjectZh: input.subject,
      subjectTh: input.subject,
      subjectEn: input.subject,
      bodyZh: input.text,
      bodyTh: input.text,
      bodyEn: input.text,
      timeLabel: now.toISOString(),
      unread: false,
      state: "sent",
      direction: "out",
      toAddr: input.to.join(", "),
      ccAddr: input.cc?.length ? input.cc.join(", ") : null,
      deliveryStatus: status,
      deliveryError: error,
      transport: transport.name,
      messageId,
      sentAt: status === "sent" ? now : null,
      sentBy: input.userId,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      inReplyTo: input.inReplyTo ?? null,
      attachments: (input.attachments ?? []).map((a) => ({ filename: a.filename, size: a.content.byteLength })),
    })
    .returning();

  await writeAudit(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    action: status === "sent" ? "MAIL_SENT" : "MAIL_FAILED",
    entityType: input.entityType || "mail",
    entityId: input.entityId || id,
    newValue: {
      mailId: id,
      to: input.to,
      cc: input.cc ?? [],
      subject: input.subject,
      transport: transport.name,
      ...(error ? { error } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments.map((a) => a.filename) } : {}),
    },
  });

  return toRecord(row!);
}

export async function listOutbound(
  db: Db,
  organizationId: string,
  filter: { entityType?: string; entityId?: string; customerId?: string; limit?: number } = {},
) {
  const clauses = [eq(mails.organizationId, organizationId), eq(mails.direction, "out")];
  if (filter.entityType) clauses.push(eq(mails.entityType, filter.entityType));
  if (filter.entityId) clauses.push(eq(mails.entityId, filter.entityId));
  if (filter.customerId) clauses.push(eq(mails.customerId, filter.customerId));
  const rows = await db
    .select()
    .from(mails)
    .where(and(...clauses))
    .orderBy(desc(mails.createdAt))
    .limit(Math.min(Math.max(filter.limit ?? 50, 1), 200));
  return rows.map(toRecord);
}

// ---------------------------------------------------------------------------
// Helpers shared by the concrete "send" actions

async function customerEmails(db: Db, customerId: string, preferContactId?: string | null) {
  const rows = await db
    .select({ id: contacts.id, email: contacts.email, primary: contacts.primary })
    .from(contacts)
    .where(eq(contacts.customerId, customerId))
    .orderBy(desc(contacts.primary), asc(contacts.createdAt));
  const sorted = preferContactId ? [...rows].sort((a, b) => Number(b.id === preferContactId) - Number(a.id === preferContactId)) : rows;
  return normalizeRecipients(sorted.map((r) => r.email)).ok;
}

async function companyName(db: Db, organizationId: string) {
  const org = await getOrganizationProfile(db, organizationId);
  return { name: org?.nameTh || org?.nameEn || "", nameEn: org?.nameEn || "", email: org?.email || null, phone: org?.phone || null };
}

function signature(co: { name: string; nameEn: string; email: string | null; phone: string | null }) {
  const lines = [co.name];
  if (co.nameEn && co.nameEn !== co.name) lines.push(co.nameEn);
  if (co.phone) lines.push(`Tel. ${co.phone}`);
  if (co.email) lines.push(co.email);
  return lines.filter(Boolean).join("\n");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** Plain text → minimal HTML (paragraphs + clickable links). */
export function textToHtml(text: string) {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1f2933">${body}</div>`;
}

function fmtMoney(v: string | number, currency: string) {
  const n = Number(v);
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function publicBaseUrl(fallbackOrigin?: string) {
  const env = process.env.APP_BASE_URL?.trim();
  return (env || fallbackOrigin || "").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Invoice / billing note e-mail with PDF attachment

export type DocKind = "invoice" | "billing_note";

type DocInfo = {
  kind: DocKind;
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerNameEn: string;
  currency: string;
  total: string;
  dueDate: Date | null;
  status: string;
};

async function loadDoc(db: Db, organizationId: string, kind: DocKind, id: string): Promise<DocInfo | null> {
  if (kind === "invoice") {
    const [r] = await db
      .select({ inv: invoices, custTh: customers.nameTh, custEn: customers.nameEn })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(eq(invoices.id, id), eq(invoices.organizationId, organizationId)))
      .limit(1);
    if (!r) return null;
    return {
      kind,
      id,
      number: r.inv.invoiceNumber,
      customerId: r.inv.customerId,
      customerName: r.custTh || r.custEn,
      customerNameEn: r.custEn || r.custTh,
      currency: r.inv.currency,
      total: r.inv.balanceDue ?? r.inv.total,
      dueDate: r.inv.dueDate,
      status: r.inv.status,
    };
  }
  const [r] = await db
    .select({ bn: billingNotes, custTh: customers.nameTh, custEn: customers.nameEn })
    .from(billingNotes)
    .innerJoin(customers, eq(billingNotes.customerId, customers.id))
    .where(and(eq(billingNotes.id, id), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!r) return null;
  return {
    kind,
    id,
    number: r.bn.billingNumber,
    customerId: r.bn.customerId,
    customerName: r.custTh || r.custEn,
    customerNameEn: r.custEn || r.custTh,
    currency: r.bn.currency,
    total: r.bn.grandTotal,
    dueDate: r.bn.scheduledPaymentDate,
    status: r.bn.status,
  };
}

function docFilename(doc: DocInfo) {
  const safe = doc.number.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `${doc.kind === "invoice" ? "Invoice" : "BillingNote"}-${safe}.pdf`;
}

export async function documentEmailDraft(db: Db, organizationId: string, kind: DocKind, id: string) {
  const doc = await loadDoc(db, organizationId, kind, id);
  if (!doc) return null;
  const co = await companyName(db, organizationId);
  const to = await customerEmails(db, doc.customerId);
  const label = doc.kind === "invoice" ? { th: "ใบแจ้งหนี้", en: "Invoice" } : { th: "ใบวางบิล", en: "Billing note" };
  const subject = `${label.th} / ${label.en} ${doc.number}${co.nameEn ? ` — ${co.nameEn}` : ""}`;
  const amount = fmtMoney(doc.total, doc.currency);
  const due = fmtDate(doc.dueDate);
  const body = [
    `เรียน ${doc.customerName}`,
    `ทางบริษัทฯ ขอส่ง${label.th}เลขที่ ${doc.number} ยอด ${amount}${due ? ` ครบกำหนดชำระ ${due}` : ""} ตามไฟล์แนบ`,
    `Dear ${doc.customerNameEn},`,
    `Please find attached ${label.en.toLowerCase()} ${doc.number} for ${amount}${due ? `, due ${due}` : ""}.`,
    `ขอบคุณครับ/ค่ะ · Thank you`,
    signature(co),
  ].join("\n\n");
  const history = await listOutbound(db, organizationId, { entityType: kind, entityId: id, limit: 20 });
  return {
    kind,
    id,
    number: doc.number,
    customerId: doc.customerId,
    customerName: doc.customerName,
    to,
    subject,
    body,
    attachment: docFilename(doc),
    history,
  };
}

export async function sendDocumentEmail(
  db: Db,
  organizationId: string,
  userId: string,
  kind: DocKind,
  id: string,
  input: { to: string[]; cc?: string[]; subject: string; body: string },
) {
  const doc = await loadDoc(db, organizationId, kind, id);
  if (!doc) return null;
  const { generateBillingNotePdf, generateInvoicePdf } = await import("./pdf.service.js");
  const pdf = kind === "invoice" ? await generateInvoicePdf(db, organizationId, id) : await generateBillingNotePdf(db, id, organizationId);
  return sendAndRecord(db, {
    organizationId,
    userId,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.body,
    html: textToHtml(input.body),
    attachments: [{ filename: docFilename(doc), content: pdf, contentType: "application/pdf" }],
    customerId: doc.customerId,
    entityType: kind,
    entityId: id,
  });
}

// ---------------------------------------------------------------------------
// Quotation acceptance link

export async function emailQuotationLink(
  db: Db,
  organizationId: string,
  userId: string,
  quotationId: string,
  link: string,
  explicitTo?: string[],
) {
  const [q] = await db
    .select({ q: quotations, custTh: customers.nameTh, custEn: customers.nameEn })
    .from(quotations)
    .innerJoin(customers, eq(quotations.customerId, customers.id))
    .where(and(eq(quotations.id, quotationId), eq(quotations.organizationId, organizationId)))
    .limit(1);
  if (!q) return null;
  const to = explicitTo?.length ? explicitTo : (await customerEmails(db, q.q.customerId, q.q.contactId)).slice(0, 1);
  if (!to.length) return { skipped: "no_recipient" as const };
  const co = await companyName(db, organizationId);
  const name = q.custTh || q.custEn;
  const nameEn = q.custEn || q.custTh;
  const lane = `${q.q.pol || q.q.origin} → ${q.q.pod || q.q.destination}`;
  const subject = `ใบเสนอราคา / Quotation ${q.q.quotationNumber} (${lane})`;
  const text = [
    `เรียน ${name}`,
    `ใบเสนอราคาเลขที่ ${q.q.quotationNumber} เส้นทาง ${lane} พร้อมแล้ว กรุณาเปิดลิงก์ด้านล่างเพื่อดูรายละเอียดและยืนยัน`,
    `Dear ${nameEn},`,
    `Your quotation ${q.q.quotationNumber} (${lane}) is ready. Open the link below to review and accept it:`,
    link,
    signature(co),
  ].join("\n\n");
  return sendAndRecord(db, {
    organizationId,
    userId,
    to,
    subject,
    text,
    html: textToHtml(text),
    customerId: q.q.customerId,
    entityType: "quotation",
    entityId: quotationId,
  });
}

// ---------------------------------------------------------------------------
// Portal access code

export async function emailPortalCode(
  db: Db,
  organizationId: string,
  userId: string,
  customerId: string,
  code: string,
  portalUrl: string,
) {
  const [cust] = await db
    .select({ id: customers.id, pin: customers.portalPin, nameTh: customers.nameTh, nameEn: customers.nameEn })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, organizationId)))
    .limit(1);
  if (!cust) return { error: "not_found" as const };
  if (!(await verifyAccessCode(code, cust.pin))) return { error: "code_mismatch" as const };
  const to = await customerEmails(db, customerId);
  if (!to.length) return { error: "no_recipient" as const };
  const co = await companyName(db, organizationId);
  const name = cust.nameTh || cust.nameEn;
  const nameEn = cust.nameEn || cust.nameTh;
  const text = [
    `เรียน ${name}`,
    `รหัสเข้าใช้งานพอร์ทัลลูกค้าของท่านคือ ${code}`,
    `เข้าสู่ระบบด้วยอีเมลของท่านและรหัสนี้ที่ ${portalUrl}`,
    `Dear ${nameEn},`,
    `Your customer portal access code is ${code}. Sign in with your e-mail address and this code at ${portalUrl}`,
    `กรุณาเก็บรหัสนี้เป็นความลับ · Please keep this code private.`,
    signature(co),
  ].join("\n\n");
  // One mail per contact so addresses are not disclosed to each other.
  const results = [];
  for (const addr of to) {
    results.push(
      await sendAndRecord(db, {
        organizationId,
        userId,
        to: [addr],
        subject: `รหัสเข้าพอร์ทัลลูกค้า / Customer portal access — ${co.nameEn || co.name}`,
        text,
        html: textToHtml(text),
        customerId,
        entityType: "customer",
        entityId: customerId,
      }),
    );
  }
  // Never keep the code in stored mail bodies or audit rows.
  await db
    .update(mails)
    .set({
      bodyZh: sql`replace(${mails.bodyZh}, ${code}, '••••-••••')`,
      bodyTh: sql`replace(${mails.bodyTh}, ${code}, '••••-••••')`,
      bodyEn: sql`replace(${mails.bodyEn}, ${code}, '••••-••••')`,
    })
    .where(and(eq(mails.organizationId, organizationId), eq(mails.entityType, "customer"), eq(mails.entityId, customerId)));
  return {
    sent: results.filter((r) => r.status === "sent").map((r) => r.to[0]!),
    failed: results.filter((r) => r.status === "failed").map((r) => ({ to: r.to[0]!, error: r.error })),
  };
}
