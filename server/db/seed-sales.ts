import { createHash, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "./index.js";
import { users } from "./schema/auth.js";
import { approvalRequests, quotationCharges, quotationRevisions, quotations, quoteAcceptanceTokens } from "./schema/commercial.js";
import { contacts, customers, leads, opportunities } from "./schema/crm.js";
import { crmDocs, mails } from "./schema/comms.js";
import { jobs } from "./schema/operations.js";
import { DEMO_ORG_ID } from "../domain/tenancy.js";
import { nextDocNumber } from "../services/sequence.service.js";
import { add, grossProfit, marginPct, mul, sub, toDb } from "../lib/money.js";
import { bangkokDate } from "./seed-operations.js";

/**
 * Demo sales data: quotations in every status (with a revision + charges each), plus a top-up of
 * the CRM sample rows (leads, deals, contacts, documents, mails) for databases seeded before those
 * rows existed. Stable ids; quotation numbers come from doc_sequences on first insert and are kept.
 * Quotations are refreshed in place on every run; CRM rows are only inserted when missing so
 * stage changes made in the app survive a re-seed. User-created rows are never touched.
 */

type QuoteStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

type QuoteSpec = {
  id: string;
  customerId: string;
  contactId?: string;
  opportunityId?: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  direction: "IMPORT" | "EXPORT";
  incoterm: string;
  commodity: string;
  containerType: string;
  quantity: number;
  currency: "USD" | "THB";
  /** Ocean freight per container. */
  buy: number;
  sell: number;
  status: QuoteStatus;
  /** Created N days ago (negative). */
  created: number;
  validDays: number;
  sales: string;
  /** Accepted quotes that became a demo job. */
  jobId?: string;
};

const QUOTES: QuoteSpec[] = [
  // Drafts
  { id: "qt-seed-01", customerId: "c2", contactId: "p8", origin: "Ningbo", destination: "Bangkok", pol: "CNNGB", pod: "THBKK", direction: "IMPORT", incoterm: "FOB", commodity: "Plastic resin", containerType: "40HC", quantity: 3, currency: "USD", buy: 830, sell: 1050, status: "DRAFT", created: -1, validDays: 14, sales: "chen@cangzhan.com" },
  { id: "qt-seed-02", customerId: "c6", contactId: "p9", origin: "Humen", destination: "Laem Chabang", pol: "CNHMN", pod: "THLCH", direction: "IMPORT", incoterm: "EXW", commodity: "Electronics", containerType: "40HC", quantity: 2, currency: "USD", buy: 960, sell: 1240, status: "DRAFT", created: -2, validDays: 14, sales: "chen@cangzhan.com" },
  { id: "qt-seed-03", customerId: "c8", contactId: "p11", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", direction: "EXPORT", incoterm: "FOB", commodity: "Empty repositioning", containerType: "40HC", quantity: 2, currency: "THB", buy: 14200, sell: 18500, status: "DRAFT", created: 0, validDays: 14, sales: "ops@cangzhan.com" },
  // Waiting for approval (thin margin / large value)
  { id: "qt-seed-04", customerId: "c4", contactId: "p3", origin: "Nansha", destination: "Laem Chabang", pol: "CNNSA", pod: "THLCH", direction: "IMPORT", incoterm: "FOB", commodity: "Machinery parts", containerType: "40HC", quantity: 6, currency: "USD", buy: 905, sell: 955, status: "PENDING_APPROVAL", created: -2, validDays: 14, sales: "sales@cangzhan.com" },
  { id: "qt-seed-05", customerId: "c9", contactId: "p4", opportunityId: "d13", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", direction: "EXPORT", incoterm: "CIF", commodity: "Frozen food", containerType: "40RF", quantity: 8, currency: "USD", buy: 1720, sell: 1850, status: "PENDING_APPROVAL", created: -1, validDays: 14, sales: "admin@cangzhan.com" },
  { id: "qt-seed-06", customerId: "c7", contactId: "p10", opportunityId: "d7", origin: "Shanghai", destination: "Bangkok", pol: "CNSHA", pod: "THBKK", direction: "IMPORT", incoterm: "CFR", commodity: "Cotton yarn", containerType: "20GP", quantity: 2, currency: "USD", buy: 590, sell: 760, status: "APPROVED", created: -3, validDays: 14, sales: "admin@cangzhan.com" },
  // Sent, waiting for the customer
  { id: "qt-seed-07", customerId: "c10", contactId: "p5", opportunityId: "d2", origin: "Laem Chabang", destination: "Ningbo", pol: "THLCH", pod: "CNNGB", direction: "EXPORT", incoterm: "CIF", commodity: "Natural rubber", containerType: "20GP", quantity: 8, currency: "THB", buy: 17700, sell: 23000, status: "SENT", created: -5, validDays: 21, sales: "chen@cangzhan.com" },
  { id: "qt-seed-08", customerId: "c5", contactId: "p7", opportunityId: "d4", origin: "Ningbo", destination: "Bangkok", pol: "CNNGB", pod: "THBKK", direction: "IMPORT", incoterm: "FOB", commodity: "General merchandise", containerType: "40HC", quantity: 4, currency: "USD", buy: 830, sell: 1060, status: "SENT", created: -4, validDays: 21, sales: "chen@cangzhan.com" },
  { id: "qt-seed-09", customerId: "c3", contactId: "p6", opportunityId: "d6", origin: "Qingdao", destination: "Laem Chabang", pol: "CNTAO", pod: "THLCH", direction: "IMPORT", incoterm: "CIF", commodity: "Chemicals (non-hazardous)", containerType: "20GP", quantity: 3, currency: "USD", buy: 640, sell: 820, status: "SENT", created: -6, validDays: 21, sales: "ops@cangzhan.com" },
  // Accepted (some already running as jobs)
  { id: "qt-seed-10", customerId: "c9", contactId: "p4", opportunityId: "d1", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", direction: "EXPORT", incoterm: "CIF", commodity: "Frozen food", containerType: "40RF", quantity: 4, currency: "USD", buy: 1720, sell: 2150, status: "ACCEPTED", created: -12, validDays: 30, sales: "admin@cangzhan.com", jobId: "s12" },
  { id: "qt-seed-11", customerId: "c1", contactId: "p1", opportunityId: "d3", origin: "Yantian", destination: "Laem Chabang", pol: "CNYTN", pod: "THLCH", direction: "IMPORT", incoterm: "FOB", commodity: "Furniture", containerType: "40HC", quantity: 4, currency: "USD", buy: 850, sell: 1090, status: "ACCEPTED", created: -104, validDays: 30, sales: "sales@cangzhan.com", jobId: "s21" },
  { id: "qt-seed-12", customerId: "c2", contactId: "p8", opportunityId: "d8", origin: "Shanghai", destination: "Laem Chabang", pol: "CNSHA", pod: "THLCH", direction: "IMPORT", incoterm: "FOB", commodity: "Auto parts", containerType: "40HC", quantity: 4, currency: "USD", buy: 790, sell: 1010, status: "ACCEPTED", created: -18, validDays: 30, sales: "chen@cangzhan.com", jobId: "s13" },
  { id: "qt-seed-13", customerId: "c6", contactId: "p9", origin: "Laem Chabang", destination: "Shekou", pol: "THLCH", pod: "CNSHK", direction: "EXPORT", incoterm: "FOB", commodity: "Canned fruit", containerType: "20GP", quantity: 2, currency: "THB", buy: 17200, sell: 21500, status: "ACCEPTED", created: -10, validDays: 30, sales: "sales@cangzhan.com", jobId: "s14" },
  // Closed: rejected / expired
  { id: "qt-seed-14", customerId: "c5", contactId: "p7", origin: "Xiamen", destination: "Bangkok", pol: "CNXMN", pod: "THBKK", direction: "IMPORT", incoterm: "FOB", commodity: "Ceramic tiles", containerType: "40HC", quantity: 2, currency: "USD", buy: 760, sell: 1120, status: "REJECTED", created: -20, validDays: 14, sales: "chen@cangzhan.com" },
  { id: "qt-seed-15", customerId: "c3", contactId: "p6", opportunityId: "d11", origin: "Qingdao", destination: "Laem Chabang", pol: "CNTAO", pod: "THLCH", direction: "IMPORT", incoterm: "CIF", commodity: "Chemicals (non-hazardous)", containerType: "20GP", quantity: 2, currency: "USD", buy: 640, sell: 860, status: "EXPIRED", created: -40, validDays: 14, sales: "ops@cangzhan.com" },
  { id: "qt-seed-16", customerId: "c8", contactId: "p11", opportunityId: "d10", origin: "Laem Chabang", destination: "Yantian", pol: "THLCH", pod: "CNYTN", direction: "EXPORT", incoterm: "FOB", commodity: "Empty repositioning", containerType: "40HC", quantity: 3, currency: "THB", buy: 14200, sell: 19200, status: "EXPIRED", created: -35, validDays: 14, sales: "ops@cangzhan.com" },
];

/** Local charges in USD (THB quotes ×34, rounded to 50). */
const QUOTE_LOCALS = [
  { code: "THC", description: "Terminal handling charge (THC)", unit: "PER_CONTAINER", buy: 118, sell: 150, only: null },
  { code: "DOC_FEE", description: "Documentation fee (B/L)", unit: "PER_BL", buy: 30, sell: 55, only: null },
  { code: "CUSTOMS", description: "Customs clearance", unit: "PER_SHIPMENT", buy: 62, sell: 95, only: "IMPORT" },
  { code: "TRUCKING", description: "Trucking (port ⇄ warehouse)", unit: "PER_CONTAINER", buy: 215, sell: 280, only: null },
] as const;

function quoteCharges(q: QuoteSpec) {
  const fx = q.currency === "THB" ? 34 : 1;
  const local = (usd: number) => (fx === 1 ? usd : Math.round((usd * fx) / 50) * 50);
  const rows = [
    { chargeCode: "OCEAN_FREIGHT", description: "Ocean freight", unit: "PER_CONTAINER", quantity: q.quantity, buyRate: q.buy, sellRate: q.sell },
    ...QUOTE_LOCALS.filter((c) => !c.only || c.only === q.direction).map((c) => ({
      chargeCode: c.code,
      description: c.description,
      unit: c.unit,
      quantity: c.unit === "PER_CONTAINER" ? q.quantity : 1,
      buyRate: local(c.buy),
      // Thin-margin quotes (pending approval) keep local charges near cost too.
      sellRate: q.status === "PENDING_APPROVAL" ? local(Math.round(c.buy * 1.06)) : local(c.sell),
    })),
  ];
  return rows.map((r) => {
    const buyAmount = mul(r.quantity, r.buyRate);
    const sellAmount = mul(r.quantity, r.sellRate);
    return {
      ...r,
      quantity: String(r.quantity),
      buyRate: String(r.buyRate),
      sellRate: String(r.sellRate),
      currency: q.currency,
      buyAmount,
      sellAmount,
      margin: sub(sellAmount, buyAmount),
      marginPercentage: marginPct(sellAmount, buyAmount),
    };
  });
}

export async function seedSales(db: Db, now = new Date()) {
  const at = (days: number, hour = 10) => new Date(`${bangkokDate(now, days)}T${String(hour).padStart(2, "0")}:00:00+07:00`);
  const staff = new Map((await db.select({ id: users.id, email: users.email }).from(users)).map((u) => [u.email, u.id]));
  const adminId = staff.get("admin@cangzhan.com") ?? "system";

  const existing = await db
    .select({ id: quotations.id, n: quotations.quotationNumber })
    .from(quotations)
    .where(inArray(quotations.id, QUOTES.map((q) => q.id)));
  const numberById = new Map(existing.map((r) => [r.id, r.n]));

  for (const q of QUOTES) {
    const quotationNumber = numberById.get(q.id) ?? (await nextDocNumber(db, "QT", "QT"));
    const created = at(q.created, 9);
    const sent = ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"].includes(q.status);
    const salesId = staff.get(q.sales) ?? null;
    const values = {
      organizationId: DEMO_ORG_ID,
      quotationNumber,
      customerId: q.customerId,
      contactId: q.contactId ?? null,
      opportunityId: q.opportunityId ?? null,
      mode: "SEA_FCL",
      serviceType: "PORT_TO_PORT",
      origin: q.origin,
      destination: q.destination,
      pol: q.pol,
      pod: q.pod,
      incoterm: q.incoterm,
      commodity: q.commodity,
      containerType: q.containerType,
      quantity: q.quantity,
      currency: q.currency,
      validFrom: created,
      validUntil: at(q.created + q.validDays, 23),
      paymentTermsDays: 30,
      salesOwnerId: salesId,
      status: q.status,
      currentRevision: 0,
      sentAt: sent ? at(q.created + 1, 11) : null,
      sentBy: sent ? salesId : null,
      updatedAt: at(q.status === "DRAFT" || q.status === "PENDING_APPROVAL" ? q.created : q.created + 2, 15),
    };
    await db
      .insert(quotations)
      .values({ id: q.id, ...values, createdAt: created })
      .onConflictDoUpdate({ target: quotations.id, set: values });

    const charges = quoteCharges(q);
    const totalBuy = add(...charges.map((c) => c.buyAmount));
    const totalSell = add(...charges.map((c) => c.sellAmount));
    const snapshot = {
      charges: charges.map((c) => ({
        chargeCode: c.chargeCode,
        description: c.description,
        quantity: c.quantity,
        unit: c.unit,
        buyRate: c.buyRate,
        sellRate: c.sellRate,
        currency: c.currency,
      })),
      totalBuy: toDb(totalBuy),
      totalSell: toDb(totalSell),
      grossProfit: toDb(grossProfit(totalSell, totalBuy)),
      marginPct: toDb(marginPct(totalSell, totalBuy)),
    };
    const revId = `${q.id}-r0`;
    const rev = {
      quotationId: q.id,
      revisionNumber: 0,
      snapshot: JSON.stringify(snapshot),
      documentHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
      reason: "Initial draft",
      immutable: sent,
      createdBy: salesId ?? adminId,
    };
    await db
      .insert(quotationRevisions)
      .values({ id: revId, ...rev, createdAt: created })
      .onConflictDoUpdate({ target: quotationRevisions.id, set: rev });
    for (const [i, c] of charges.entries()) {
      const row = {
        revisionId: revId,
        chargeCode: c.chargeCode,
        description: c.description,
        quantity: c.quantity,
        unit: c.unit,
        buyRate: c.buyRate,
        sellRate: c.sellRate,
        currency: c.currency,
        exchangeRate: "1",
        buyAmount: toDb(c.buyAmount),
        sellAmount: toDb(c.sellAmount),
        margin: toDb(c.margin),
        marginPercentage: toDb(c.marginPercentage),
      };
      await db
        .insert(quotationCharges)
        .values({ id: `${revId}-c${i}`, ...row })
        .onConflictDoUpdate({ target: quotationCharges.id, set: row });
    }

    if (q.status === "PENDING_APPROVAL") {
      await db
        .insert(approvalRequests)
        .values({ id: `${q.id}-ap`, entityType: "quotation", entityId: q.id, requestedBy: salesId ?? adminId, requestedAt: at(q.created, 16), decision: null })
        .onConflictDoUpdate({ target: approvalRequests.id, set: { requestedAt: at(q.created, 16), decision: null, decidedAt: null, approverId: null } });
    }
    if (q.status === "SENT") {
      // Public acceptance link; the token is random and kept across re-seeds.
      await db
        .insert(quoteAcceptanceTokens)
        .values({ id: `${q.id}-tok`, token: randomBytes(24).toString("base64url"), quotationId: q.id, revisionId: revId, expiresAt: values.validUntil })
        .onConflictDoUpdate({ target: quoteAcceptanceTokens.id, set: { expiresAt: values.validUntil, revoked: false } });
    }
    if (q.jobId) {
      await db.update(jobs).set({ quotationId: q.id, quotationRevisionId: revId }).where(eq(jobs.id, q.jobId));
    }
  }

  const crm = await topUpCrm(db, now);
  return { quotations: QUOTES.length, ...crm };
}

/** Insert CRM sample rows added after a database was first seeded (missing ids only). */
async function topUpCrm(db: Db, now: Date) {
  const { contacts: seedContacts, leads: seedLeads, deals: seedDeals, docs: seedDocs } = await import("../../src/crm.js");
  const { customers: seedCustomers } = await import("../../src/data.js");
  const known = new Set(seedCustomers.map((c) => c.id));
  const have = new Set((await db.select({ id: customers.id }).from(customers).where(inArray(customers.id, [...known]))).map((r) => r.id));
  const ok = (customerId: string) => have.has(customerId);

  const c = seedContacts.filter((p) => ok(p.customerId));
  if (c.length) {
    await db
      .insert(contacts)
      .values(c.map((p) => ({ id: p.id, customerId: p.customerId, name: p.name, title: p.title, email: p.email, phone: p.phone, wechat: p.wechat, primary: p.primary })))
      .onConflictDoNothing();
  }
  await db
    .insert(leads)
    .values(seedLeads.map((l) => ({ id: l.id, organizationId: DEMO_ORG_ID, company: l.company, city: l.city, lane: l.lane, contact: l.contact, source: l.source, stage: l.stage, teu: l.teu, owner: l.owner, updated: l.updated })))
    .onConflictDoNothing();
  const deals = seedDeals.filter((d) => ok(d.customerId));
  for (const d of deals) {
    // Close dates are relative to today; stage / value edits made in the app are kept.
    await db
      .insert(opportunities)
      .values({ id: d.id, customerId: d.customerId, title: d.title, lane: d.lane, stage: d.stage, value: d.value, teu: d.teu, close: d.close, owner: d.owner })
      .onConflictDoUpdate({ target: opportunities.id, set: { close: d.close } });
  }
  const docs = seedDocs.filter((d) => ok(d.customerId));
  if (docs.length) {
    await db
      .insert(crmDocs)
      .values(docs.map((d) => ({ id: d.id, organizationId: DEMO_ORG_ID, customerId: d.customerId, boxId: d.boxId, kind: d.kind, name: d.name, status: d.status, updated: d.updated })))
      .onConflictDoNothing();
  }

  const extraMails = EXTRA_MAILS(now).filter((m) => ok(m.customerId));
  for (const m of extraMails) {
    await db
      .insert(mails)
      .values({ ...m, organizationId: DEMO_ORG_ID })
      .onConflictDoNothing();
  }

  return { leads: seedLeads.length, deals: deals.length, contacts: c.length, docs: docs.length, mails: extraMails.length };
}

/** Additional inbox samples (all three languages stored, like the original seed mails). */
function EXTRA_MAILS(now: Date) {
  const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  return [
    {
      id: "m-seed-01",
      customerId: "c1",
      fromAddr: "hai@huayun-sz.cn",
      subjectZh: "蛇口家具柜何时派送？",
      subjectTh: "ตู้เฟอร์นิเจอร์จากเสอโข่วจะส่งเมื่อไร",
      subjectEn: "When will the Shekou furniture box be delivered?",
      bodyZh: "林经理：ONEU0417736 已经清关放行了吗？客户仓库周四上午可以收货，请安排派送并告知车牌。",
      bodyTh: "คุณหลิน: ONEU0417736 ผ่านพิธีการศุลกากรแล้วหรือยัง คลังลูกค้ารับของได้เช้าวันพฤหัส ช่วยจัดรถและแจ้งทะเบียนรถด้วย",
      bodyEn: "Lin: has ONEU0417736 cleared customs? The consignee's warehouse can receive Thursday morning — please book the truck and send the plate number.",
      draftZh: "已放行。我们安排周四 08:30 派送，车牌与司机电话明天下午发您。",
      draftTh: "ผ่านพิธีการแล้ว จัดส่งวันพฤหัส 08:30 จะส่งทะเบียนรถและเบอร์คนขับให้พรุ่งนี้บ่าย",
      draftEn: "Cleared. Delivery booked for Thursday 08:30; we'll send the plate and driver's phone tomorrow afternoon.",
      timeLabel: ago(2),
      confidence: "0.9100",
      unread: true,
      state: "open",
      extractedBoxes: ["ONEU0417736"],
    },
    {
      id: "m-seed-02",
      customerId: "c7",
      fromAddr: "docs@sh-asean.com",
      subjectZh: "八月运费发票核对",
      subjectTh: "ตรวจสอบใบแจ้งหนี้ค่าระวางเดือน ส.ค.",
      subjectEn: "Checking the August freight invoice",
      bodyZh: "您好，八月棉纱两柜的发票我们已付 40%，余款财务本周审批，请把对账单再发一次。",
      bodyTh: "สวัสดีค่ะ ใบแจ้งหนี้เส้นด้ายฝ้าย 2 ตู้เดือน ส.ค. เราจ่ายไปแล้ว 40% ส่วนที่เหลือฝ่ายบัญชีจะอนุมัติสัปดาห์นี้ รบกวนส่งใบแจ้งยอดอีกครั้ง",
      bodyEn: "Hello, we've paid 40% of the August cotton-yarn invoice; finance approves the balance this week. Please resend the statement.",
      draftZh: "收到，已重发对账单（含账单通知），余款请于本周内安排，谢谢。",
      draftTh: "รับทราบ ส่งใบแจ้งยอดพร้อมใบวางบิลให้แล้ว รบกวนชำระส่วนที่เหลือภายในสัปดาห์นี้ ขอบคุณค่ะ",
      draftEn: "Noted — statement and billing note resent. Please arrange the balance this week, thank you.",
      timeLabel: ago(5),
      confidence: "0.8700",
      unread: true,
      state: "open",
    },
    {
      id: "m-seed-03",
      customerId: "c9",
      fromAddr: "export@rayong-food.co.th",
      subjectZh: "下周冷冻柜再加 2 只",
      subjectTh: "สัปดาห์หน้าขอเพิ่มตู้เย็นอีก 2 ตู้",
      subjectEn: "Two more reefers next week",
      bodyZh: "下周盐田班能否再加 2×40RF？温度 -18°C，货量已确认。",
      bodyTh: "รอบหยานเถียนสัปดาห์หน้าขอเพิ่ม 2×40RF ได้ไหม อุณหภูมิ -18°C ยืนยันปริมาณสินค้าแล้ว",
      bodyEn: "Can we add 2×40RF to next week's Yantian sailing? Set point -18°C, volume confirmed.",
      draftZh: "可以，已向 ONE 申请 2 只冷柜，预冷后明天确认放柜时间。",
      draftTh: "ได้ค่ะ ขอตู้เย็น 2 ตู้กับ ONE แล้ว จะยืนยันเวลารับตู้หลังพรีคูลพรุ่งนี้",
      draftEn: "Yes — 2 reefers requested from ONE; we'll confirm the release time after pre-cooling tomorrow.",
      timeLabel: ago(20),
      confidence: "0.8800",
      unread: false,
      state: "open",
      origin: "THLCH",
      dest: "CNYTN",
    },
    {
      id: "m-seed-04",
      customerId: "c4",
      fromAddr: "ops@nansha-lianyun.cn",
      subjectZh: "南沙两柜海关查验",
      subjectTh: "ศุลกากรตรวจ 2 ตู้จากหนานซา",
      subjectEn: "Customs inspection on the two Nansha boxes",
      bodyZh: "CSNU6620418、CSNU6620423 被抽中查验，产地证还没到，请协助跟进。",
      bodyTh: "CSNU6620418 และ CSNU6620423 ถูกสุ่มตรวจ C/O ยังไม่มา รบกวนช่วยติดตาม",
      bodyEn: "CSNU6620418 and CSNU6620423 were picked for inspection and the C/O has not arrived yet — please follow up.",
      draftZh: "已预约明早查验，产地证请今天内补传，我们同步报关行。",
      draftTh: "นัดตรวจพรุ่งนี้เช้าแล้ว รบกวนส่ง C/O ภายในวันนี้ เราจะแจ้งชิปปิ้งให้",
      draftEn: "Inspection booked for tomorrow morning. Please send the C/O today; we'll loop in the broker.",
      timeLabel: ago(28),
      confidence: "0.8200",
      unread: false,
      state: "open",
      extractedBoxes: ["CSNU6620418", "CSNU6620423"],
      docsMissing: ["CO"],
      needsHuman: true,
    },
  ];
}
