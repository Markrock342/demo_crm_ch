import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { customers } from "../db/schema/crm.js";
import { billingNoteItems, billingNotes, invoices } from "../db/schema/finance.js";
import { getQuotationDetail } from "./quotation.service.js";

const COMPANY = {
  name: "CANGZHAN Freight Forwarding Co., Ltd.",
  nameLocal: "沧栈国际货运代理有限公司",
  address: "Laem Chabang Port Logistics Park, Chonburi, Thailand",
  taxId: "0105559999999",
};

function drawHeader(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  title: string,
  sub: string,
) {
  page.drawText(COMPANY.name, { x: 50, y: 780, size: 14, font: bold, color: rgb(0.1, 0.2, 0.25) });
  page.drawText(COMPANY.nameLocal, { x: 50, y: 762, size: 10, font });
  page.drawText(COMPANY.address, { x: 50, y: 748, size: 8, font, color: rgb(0.4, 0.45, 0.5) });
  page.drawText(`Tax ID: ${COMPANY.taxId}`, { x: 50, y: 736, size: 8, font });
  page.drawText(title, { x: 50, y: 710, size: 18, font: bold, color: rgb(0.05, 0.45, 0.42) });
  page.drawText(sub, { x: 50, y: 692, size: 10, font });
}

export async function generateQuotationPdf(db: Db, quotationId: string): Promise<Uint8Array> {
  const detail = await getQuotationDetail(db, quotationId, ["SUPER_ADMIN"]);
  if (!detail?.revision) throw new Error("not_found");

  const [cust] = await db.select().from(customers).where(eq(customers.id, detail.quotation.customerId)).limit(1);
  const q = detail.quotation;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  drawHeader(
    page,
    font,
    bold,
    "QUOTATION",
    `${q.quotationNumber} · Rev.${q.currentRevision} · ${new Date().toISOString().slice(0, 10)}`,
  );

  let y = 670;
  page.drawText("Customer", { x: 50, y, size: 9, font: bold });
  y -= 14;
  page.drawText(cust?.nameEn ?? cust?.nameZh ?? q.customerId, { x: 50, y, size: 10, font });
  y -= 24;
  page.drawText(`Route: ${q.origin} → ${q.destination}`, { x: 50, y, size: 10, font });
  y -= 14;
  page.drawText(`POL/POD: ${q.pol} → ${q.pod} · ${q.mode} · ${q.containerType ?? "—"} × ${q.quantity}`, { x: 50, y, size: 10, font });
  y -= 14;
  page.drawText(`Valid until: ${q.validUntil ? new Date(q.validUntil).toISOString().slice(0, 10) : "—"}`, { x: 50, y, size: 9, font });
  y -= 28;

  page.drawText("Description", { x: 50, y, size: 9, font: bold });
  page.drawText("Amount", { x: 420, y, size: 9, font: bold });
  y -= 16;

  for (const c of detail.charges) {
    page.drawText(c.description.slice(0, 52), { x: 50, y, size: 9, font });
    page.drawText(`${c.sellAmount} ${c.currency}`, { x: 420, y, size: 9, font });
    y -= 14;
    if (y < 120) break;
  }

  y -= 10;
  page.drawText(`Grand Total: ${detail.totals?.totalSell ?? "0"} ${q.currency}`, { x: 50, y, size: 12, font: bold });
  y -= 40;
  page.drawText("Terms & Conditions", { x: 50, y, size: 9, font: bold });
  y -= 14;
  const terms = q.termsAndConditions ?? "Rates subject to carrier availability. Payment per agreed credit terms.";
  page.drawText(terms.slice(0, 220), { x: 50, y, size: 8, font, maxWidth: 500 });

  return pdf.save();
}

export async function generateBillingNotePdf(db: Db, billingNoteId: string): Promise<Uint8Array> {
  const [bn] = await db.select().from(billingNotes).where(eq(billingNotes.id, billingNoteId)).limit(1);
  if (!bn) throw new Error("not_found");

  const items = await db.select().from(billingNoteItems).where(eq(billingNoteItems.billingNoteId, billingNoteId));
  const invIds = items.map((i) => i.invoiceId);
  const invRows = invIds.length ? await db.select().from(invoices).where(inArray(invoices.id, invIds)) : [];
  const [cust] = await db.select().from(customers).where(eq(customers.id, bn.customerId)).limit(1);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  drawHeader(page, font, bold, "BILLING NOTE / ใบวางบิล", `${bn.billingNumber} · ${bn.billingDate.toISOString().slice(0, 10)}`);

  let y = 670;
  page.drawText(cust?.nameEn ?? cust?.nameZh ?? bn.customerId, { x: 50, y, size: 11, font: bold });
  y -= 24;
  page.drawText("Invoice No.", { x: 50, y, size: 9, font: bold });
  page.drawText("Due", { x: 200, y, size: 9, font: bold });
  page.drawText("Amount", { x: 420, y, size: 9, font: bold });
  y -= 16;

  for (const item of items) {
    const inv = invRows.find((i) => i.id === item.invoiceId);
    page.drawText(inv?.invoiceNumber ?? item.invoiceId, { x: 50, y, size: 9, font });
    page.drawText(inv ? inv.dueDate.toISOString().slice(0, 10) : "—", { x: 200, y, size: 9, font });
    page.drawText(`${item.amount} ${bn.currency}`, { x: 420, y, size: 9, font });
    y -= 14;
  }

  y -= 10;
  page.drawText(`Grand Total: ${bn.grandTotal} ${bn.currency}`, { x: 50, y, size: 12, font: bold });
  return pdf.save();
}
