import { PDFDocument, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customers } from "../db/schema/crm.js";
import { billingNoteItems, billingNotes, invoiceLines, invoices } from "../db/schema/finance.js";
import { jobs } from "../db/schema/operations.js";
import { drawText, embedPdfFonts, fitText, wrapText, type PdfFonts } from "../lib/pdf-text.js";
import { getOrganizationProfile, readOrganizationLogo, type OrganizationDto } from "./organization.service.js";
import { getQuotationDetail } from "./quotation.service.js";

const A4: [number, number] = [595, 842];
const LEFT = 50;
const RIGHT = 545;
const INK = rgb(0.1, 0.2, 0.25);
const MUTED = rgb(0.4, 0.45, 0.5);
const BRAND = rgb(0.05, 0.45, 0.42);
const RULE = rgb(0.75, 0.78, 0.8);

/** Fallback header when an organization has no profile row yet. */
const FALLBACK_COMPANY: Pick<OrganizationDto, "nameEn" | "nameTh" | "nameZh" | "addressEn" | "taxId"> = {
  nameEn: "Company name not set",
  nameTh: null,
  nameZh: null,
  addressEn: null,
  taxId: null,
};

type Ctx = {
  pdf: PDFDocument;
  fonts: PdfFonts;
  org: OrganizationDto | null;
  logo: PDFImage | null;
};

async function createDoc(db: Db, organizationId: string | null): Promise<Ctx> {
  const pdf = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdf);
  const org = organizationId ? await getOrganizationProfile(db, organizationId) : null;
  let logo: PDFImage | null = null;
  if (organizationId && org?.hasLogo) {
    const file = await readOrganizationLogo(db, organizationId);
    if (file) {
      try {
        logo = file.mime === "image/jpeg" ? await pdf.embedJpg(file.bytes) : await pdf.embedPng(file.bytes);
      } catch {
        logo = null; // a broken upload must never block a document
      }
    }
  }
  return { pdf, fonts, org, logo };
}

type TextOpts = { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" };

function text(ctx: Ctx, page: PDFPage, value: string, x: number, y: number, opts: TextOpts) {
  return drawText(page, ctx.fonts, value, { x, y, ...opts });
}

/** Draw wrapped text; returns the y below the last line. */
function paragraph(ctx: Ctx, page: PDFPage, value: string, x: number, y: number, width: number, opts: TextOpts, maxLines = 12) {
  const lines = wrapText(ctx.fonts, value, opts.size, width, opts.bold).slice(0, maxLines);
  const lh = opts.size * 1.45;
  for (const l of lines) {
    text(ctx, page, l, x, y, opts);
    y -= lh;
  }
  return y;
}

function branchLabel(org: OrganizationDto) {
  if (org.branchType === "branch") return `Branch ${org.branchCode || ""} / สาขา ${org.branchCode || ""}`.replace(/\s+\//, " /");
  return "Head office / สำนักงานใหญ่";
}

/**
 * Company block (logo, names in all languages, address, tax ID, contacts) + document title.
 * Returns the y coordinate where the document body starts.
 */
function drawHeader(ctx: Ctx, page: PDFPage, title: string, sub: string): number {
  const org = ctx.org;
  const c = org ?? FALLBACK_COMPANY;
  let textX = LEFT;
  let y = 790;

  if (ctx.logo) {
    const h = 46;
    const w = Math.min(120, (ctx.logo.width / ctx.logo.height) * h);
    const scaledH = (ctx.logo.height / ctx.logo.width) * w;
    page.drawImage(ctx.logo, { x: LEFT, y: y - scaledH + 12, width: w, height: scaledH });
    textX = LEFT + w + 14;
  }
  const width = RIGHT - textX;

  text(ctx, page, fitText(ctx.fonts, c.nameEn, 14, width, true), textX, y, { size: 14, bold: true, color: INK });
  y -= 16;
  const local = [c.nameTh, c.nameZh].filter(Boolean).join("  ·  ");
  if (local) {
    text(ctx, page, fitText(ctx.fonts, local, 10, width), textX, y, { size: 10, color: INK });
    y -= 14;
  }
  const address = [org?.addressTh, c.addressEn, org?.addressZh].filter(Boolean) as string[];
  for (const a of address.slice(0, 2)) {
    y = paragraph(ctx, page, a, textX, y, width, { size: 8, color: MUTED }, 2);
  }
  const tax = [c.taxId ? `Tax ID / เลขประจำตัวผู้เสียภาษี ${c.taxId}` : null, org ? branchLabel(org) : null].filter(Boolean).join("  ·  ");
  if (tax) {
    text(ctx, page, fitText(ctx.fonts, tax, 8, width), textX, y, { size: 8, color: INK });
    y -= 11;
  }
  const contact = [org?.phone ? `Tel ${org.phone}` : null, org?.email, org?.website].filter(Boolean).join("  ·  ");
  if (contact) {
    text(ctx, page, fitText(ctx.fonts, contact, 8, width), textX, y, { size: 8, color: MUTED });
    y -= 11;
  }

  y -= 14;
  page.drawLine({ start: { x: LEFT, y: y + 6 }, end: { x: RIGHT, y: y + 6 }, thickness: 0.6, color: RULE });
  y -= 14;
  text(ctx, page, title, LEFT, y, { size: 18, bold: true, color: BRAND });
  y -= 18;
  text(ctx, page, sub, LEFT, y, { size: 10, color: INK });
  return y - 22;
}

/** Bank details + footer note at the bottom of invoice-type documents. */
function drawPaymentFooter(ctx: Ctx, page: PDFPage, y: number, note: string | null | undefined) {
  const org = ctx.org;
  const bank = org
    ? [
        org.bankName ? `${org.bankName}${org.bankBranch ? ` (${org.bankBranch})` : ""}` : null,
        org.bankAccountName ? `Account name / ชื่อบัญชี: ${org.bankAccountName}` : null,
        org.bankAccountNo ? `Account no. / เลขที่บัญชี: ${org.bankAccountNo}` : null,
        org.bankSwift ? `SWIFT: ${org.bankSwift}` : null,
      ].filter(Boolean)
    : [];
  if (bank.length) {
    y -= 10;
    text(ctx, page, "Payment / การชำระเงิน", LEFT, y, { size: 9, bold: true, color: INK });
    y -= 13;
    for (const b of bank) {
      text(ctx, page, b!, LEFT, y, { size: 8.5, color: INK });
      y -= 12;
    }
  }
  if (note?.trim()) {
    y -= 8;
    y = paragraph(ctx, page, note, LEFT, y, RIGHT - LEFT, { size: 8, color: MUTED }, 6);
  }
  return y;
}

function customerNames(cust: { nameEn: string; nameTh: string | null; nameZh: string | null } | undefined, fallback: string) {
  if (!cust) return { primary: fallback, secondary: "" };
  const primary = cust.nameEn || cust.nameTh || cust.nameZh || fallback;
  const secondary = [cust.nameTh, cust.nameZh].filter((n) => n && n !== primary).join("  ·  ");
  return { primary, secondary };
}

/** YYYY-MM-DD as seen in Bangkok (company timezone), not UTC. */
function ymd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function fmtAmount(v: string | number) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
}

export async function generateQuotationPdf(db: Db, organizationId: string, quotationId: string): Promise<Uint8Array> {
  const detail = await getQuotationDetail(db, organizationId, quotationId, ["SUPER_ADMIN"]);
  if (!detail?.revision) throw new Error("not_found");

  const [cust] = await db.select().from(customers).where(eq(customers.id, detail.quotation.customerId)).limit(1);
  const q = detail.quotation;

  const ctx = await createDoc(db, organizationId);
  ctx.pdf.setTitle(`Quotation ${q.quotationNumber}`);
  let page = ctx.pdf.addPage(A4);

  let y = drawHeader(
    ctx,
    page,
    "QUOTATION  ใบเสนอราคา  报价单",
    `${q.quotationNumber} · Rev.${q.currentRevision} · ${ymd(new Date())}`,
  );

  const names = customerNames(cust, q.customerId);
  text(ctx, page, "Customer / ลูกค้า", LEFT, y, { size: 9, bold: true });
  y -= 14;
  text(ctx, page, fitText(ctx.fonts, names.primary, 10, RIGHT - LEFT), LEFT, y, { size: 10 });
  y -= 13;
  if (names.secondary) {
    text(ctx, page, fitText(ctx.fonts, names.secondary, 9, RIGHT - LEFT), LEFT, y, { size: 9, color: MUTED });
    y -= 13;
  }
  y -= 10;
  text(ctx, page, `Route: ${q.origin} → ${q.destination}`, LEFT, y, { size: 10 });
  y -= 14;
  text(ctx, page, `POL/POD: ${q.pol} → ${q.pod} · ${q.mode} · ${q.containerType ?? "—"} × ${q.quantity}`, LEFT, y, { size: 10 });
  y -= 14;
  text(ctx, page, `Valid until: ${q.validUntil ? ymd(new Date(q.validUntil)) : "—"}`, LEFT, y, { size: 9 });
  y -= 26;

  const header = () => {
    text(ctx, page, "Description", LEFT, y, { size: 9, bold: true });
    text(ctx, page, "Amount", RIGHT, y, { size: 9, bold: true, align: "right" });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: RULE });
    y -= 14;
  };
  header();

  for (const c of detail.charges) {
    if (y < 150) {
      page = ctx.pdf.addPage(A4);
      y = 780;
      header();
    }
    text(ctx, page, fitText(ctx.fonts, c.description, 9, 340), LEFT, y, { size: 9 });
    text(ctx, page, `${fmtAmount(c.sellAmount)} ${c.currency}`, RIGHT, y, { size: 9, align: "right" });
    y -= 14;
  }

  y -= 10;
  text(ctx, page, `Grand total: ${fmtAmount(detail.totals?.totalSell ?? "0")} ${q.currency}`, RIGHT, y, {
    size: 12,
    bold: true,
    align: "right",
  });
  y -= 34;
  if (y < 150) {
    page = ctx.pdf.addPage(A4);
    y = 780;
  }
  text(ctx, page, "Terms & conditions / เงื่อนไข", LEFT, y, { size: 9, bold: true });
  y -= 14;
  const terms = q.termsAndConditions ?? "Rates subject to carrier availability. Payment per agreed credit terms.";
  y = paragraph(ctx, page, terms, LEFT, y, RIGHT - LEFT, { size: 8 }, 8);
  if (ctx.org?.quotationFooter) {
    y -= 8;
    paragraph(ctx, page, ctx.org.quotationFooter, LEFT, y, RIGHT - LEFT, { size: 8, color: MUTED }, 6);
  }

  return ctx.pdf.save();
}

export async function generateBillingNotePdf(db: Db, billingNoteId: string, organizationId?: string): Promise<Uint8Array> {
  const [bn] = await db.select().from(billingNotes).where(eq(billingNotes.id, billingNoteId)).limit(1);
  if (!bn) throw new Error("not_found");
  const [cust] = await db.select().from(customers).where(eq(customers.id, bn.customerId)).limit(1);
  // Billing notes carry no tenant column; the customer does.
  if (organizationId && cust?.organizationId && cust.organizationId !== organizationId) throw new Error("not_found");

  const items = await db.select().from(billingNoteItems).where(eq(billingNoteItems.billingNoteId, billingNoteId));
  const invIds = items.map((i) => i.invoiceId);
  const invRows = invIds.length ? await db.select().from(invoices).where(inArray(invoices.id, invIds)) : [];

  const ctx = await createDoc(db, organizationId ?? cust?.organizationId ?? null);
  ctx.pdf.setTitle(`Billing note ${bn.billingNumber}`);
  let page = ctx.pdf.addPage(A4);

  let y = drawHeader(ctx, page, "BILLING NOTE  ใบวางบิล  对账单", `${bn.billingNumber} · ${ymd(bn.billingDate)}`);

  const names = customerNames(cust, bn.customerId);
  text(ctx, page, fitText(ctx.fonts, names.primary, 11, RIGHT - LEFT, true), LEFT, y, { size: 11, bold: true });
  y -= 14;
  if (names.secondary) {
    text(ctx, page, fitText(ctx.fonts, names.secondary, 9, RIGHT - LEFT), LEFT, y, { size: 9, color: MUTED });
    y -= 13;
  }
  if (bn.billingAddress) y = paragraph(ctx, page, bn.billingAddress, LEFT, y, 320, { size: 9 }, 3);
  y -= 12;

  const header = () => {
    text(ctx, page, "Invoice no.", LEFT, y, { size: 9, bold: true });
    text(ctx, page, "Due", 220, y, { size: 9, bold: true });
    text(ctx, page, "Amount", RIGHT, y, { size: 9, bold: true, align: "right" });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: RULE });
    y -= 14;
  };
  header();

  for (const item of items) {
    if (y < 180) {
      page = ctx.pdf.addPage(A4);
      y = 780;
      header();
    }
    const inv = invRows.find((i) => i.id === item.invoiceId);
    text(ctx, page, inv?.invoiceNumber ?? item.invoiceId, LEFT, y, { size: 9 });
    text(ctx, page, inv ? ymd(inv.dueDate) : "—", 220, y, { size: 9 });
    text(ctx, page, `${fmtAmount(item.amount)} ${bn.currency}`, RIGHT, y, { size: 9, align: "right" });
    y -= 14;
  }

  y -= 10;
  text(ctx, page, `Grand total: ${fmtAmount(bn.grandTotal)} ${bn.currency}`, RIGHT, y, { size: 12, bold: true, align: "right" });
  y -= 24;
  drawPaymentFooter(ctx, page, y, ctx.org?.invoiceFooter);
  return ctx.pdf.save();
}

export async function generateInvoicePdf(db: Db, organizationId: string, invoiceId: string): Promise<Uint8Array> {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!inv) throw new Error("not_found");

  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  const [cust] = await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
  const [job] = inv.jobId ? await db.select().from(jobs).where(eq(jobs.id, inv.jobId)).limit(1) : [];

  const ctx = await createDoc(db, organizationId);
  ctx.pdf.setTitle(`Invoice ${inv.invoiceNumber}`);
  let page = ctx.pdf.addPage(A4);

  const status = inv.status === "DRAFT" ? " · DRAFT" : "";
  let y = drawHeader(ctx, page, "INVOICE  ใบแจ้งหนี้  发票", `${inv.invoiceNumber} · Issued ${ymd(inv.issueDate)}${status}`);

  const names = customerNames(cust, inv.customerId);
  text(ctx, page, "Bill to / ลูกค้า", LEFT, y, { size: 9, bold: true });
  text(ctx, page, "Due date / ครบกำหนด", 380, y, { size: 9, bold: true });
  y -= 14;
  text(ctx, page, fitText(ctx.fonts, names.primary, 11, 320), LEFT, y, { size: 11 });
  text(ctx, page, ymd(inv.dueDate), 380, y, { size: 11 });
  y -= 14;
  if (names.secondary) {
    text(ctx, page, fitText(ctx.fonts, names.secondary, 9, 320), LEFT, y, { size: 9, color: MUTED });
    y -= 13;
  }
  if (inv.billingAddress) y = paragraph(ctx, page, inv.billingAddress, LEFT, y, 320, { size: 9 }, 3);
  if (job) {
    text(ctx, page, `Job ${job.jobNumber} · ${job.pol} → ${job.pod}${job.vessel ? ` · ${job.vessel} ${job.voyage ?? ""}` : ""}`, LEFT, y, {
      size: 9,
    });
    y -= 14;
  }
  text(ctx, page, `Terms: ${inv.paymentTermsDays} days · Currency: ${inv.currency}`, LEFT, y, { size: 9, color: MUTED });
  y -= 26;

  const header = () => {
    text(ctx, page, "Description", LEFT, y, { size: 9, bold: true });
    text(ctx, page, "Qty", 360, y, { size: 9, bold: true, align: "right" });
    text(ctx, page, "Unit price", 450, y, { size: 9, bold: true, align: "right" });
    text(ctx, page, "Amount", RIGHT, y, { size: 9, bold: true, align: "right" });
    y -= 6;
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color: RULE });
    y -= 14;
  };
  header();

  for (const l of lines) {
    const descLines = wrapText(ctx.fonts, l.description, 9, 280).slice(0, 3);
    if (y - descLines.length * 12 < 150) {
      page = ctx.pdf.addPage(A4);
      y = 780;
      header();
    }
    text(ctx, page, Number(l.quantity).toString(), 360, y, { size: 9, align: "right" });
    text(ctx, page, fmtAmount(l.unitAmount), 450, y, { size: 9, align: "right" });
    text(ctx, page, fmtAmount(l.amount), RIGHT, y, { size: 9, align: "right" });
    for (const d of descLines) {
      text(ctx, page, d, LEFT, y, { size: 9 });
      y -= 12;
    }
    y -= 3;
  }

  y -= 4;
  page.drawLine({ start: { x: 330, y }, end: { x: RIGHT, y }, thickness: 0.5, color: RULE });
  y -= 16;
  const totalRow = (label: string, value: string, strong = false) => {
    text(ctx, page, label, 340, y, { size: strong ? 11 : 9, bold: strong });
    text(ctx, page, `${fmtAmount(value)} ${inv.currency}`, RIGHT, y, { size: strong ? 11 : 9, bold: strong, align: "right" });
    y -= strong ? 18 : 14;
  };
  totalRow("Subtotal", inv.subtotal);
  totalRow("Tax", inv.tax);
  totalRow("Total", inv.total, true);
  if (Number(inv.paidAmount) > 0) {
    totalRow("Paid", inv.paidAmount);
    totalRow("Balance due", inv.balanceDue, true);
  }

  if (y < 170) {
    page = ctx.pdf.addPage(A4);
    y = 780;
  }
  if (inv.notes) {
    y -= 12;
    text(ctx, page, "Notes / หมายเหตุ", LEFT, y, { size: 9, bold: true });
    y -= 14;
    y = paragraph(ctx, page, inv.notes, LEFT, y, RIGHT - LEFT, { size: 8 }, 6);
  }
  drawPaymentFooter(ctx, page, y - 6, ctx.org?.invoiceFooter);

  return ctx.pdf.save();
}
