import type { ShellCustomer, ShellContact, ShellContactRole } from "../ports/crm.port.ts";
import type { ShellJob, ShellJobMilestone } from "../ports/job.port.ts";
import { DEFAULT_MILESTONES } from "../ports/job.port.ts";
import type { ShellBox, ShellShipment, ShellDemurrageRisk, ShellBoxStatus, ShellShipmentStatus } from "../ports/ops.port.ts";
import type { ShellQuotation, ShellQuoteStatus } from "../ports/quote.port.ts";
import type { ShellInvoice } from "../ports/billing.port.ts";
import type { ShellDocItem, ShellDocType, ShellRate, ShellTask, ShellVendor, ShellVendorBill } from "./supportStore.tsx";
import { SHELL_BOX_STATUSES } from "../ports/ops.port.ts";

const LANES = [
  { pol: "CNSHA", pod: "THLCH", origin: "Shanghai", destination: "Laem Chabang", laneZh: "上海→林查班" },
  { pol: "CNNGB", pod: "THLCH", origin: "Ningbo", destination: "Laem Chabang", laneZh: "宁波→林查班" },
  { pol: "CNYTN", pod: "THLCH", origin: "Yantian", destination: "Laem Chabang", laneZh: "盐田→林查班" },
  { pol: "CNSZX", pod: "THBKK", origin: "Shenzhen", destination: "Bangkok", laneZh: "深圳→曼谷" },
  { pol: "CNCAN", pod: "THLCH", origin: "Guangzhou", destination: "Laem Chabang", laneZh: "广州→林查班" },
  { pol: "THLCH", pod: "CNSHA", origin: "Laem Chabang", destination: "Shanghai", laneZh: "林查班→上海" },
  { pol: "THLCH", pod: "CNNGB", origin: "Laem Chabang", destination: "Ningbo", laneZh: "林查班→宁波" },
  { pol: "THLCH", pod: "CNYTN", origin: "Laem Chabang", destination: "Yantian", laneZh: "林查班→盐田" },
] as const;

const CARRIERS = ["COSCO", "MSC", "OOCL", "Evergreen", "ONE"] as const;
const OWNERS_SALES = ["陈销售", "王销售", "李销售", "张销售"] as const;
const OWNERS_OPS = ["赵操作", "钱操作", "孙操作", ""] as const;
const ROLES: ShellContactRole[] = ["Purchasing", "ImportExport", "Accounting", "Warehouse", "Management", "Other"];

function ms(partial: Array<[string, string | null]>): ShellJobMilestone[] {
  return DEFAULT_MILESTONES.map((m) => {
    const hit = partial.find(([c]) => c === m.code);
    return { ...m, actualAt: hit ? hit[1] : null };
  });
}

function yard(slot: string) {
  return {
    yardZh: `林查班 ${slot}`,
    yardTh: `แหลมฉบัง ${slot}`,
    yardEn: `Laem Chabang ${slot}`,
  };
}

const CUSTOMER_META: Array<{ zh: string; th: string; en: string; cityZh: string; cityTh: string; cityEn: string }> = [
  { zh: "粤泰贸易", th: "Yuetai Trading", en: "Yuetai Trading", cityZh: "广州", cityTh: "กว่างโจว", cityEn: "Guangzhou" },
  { zh: "东海供应链", th: "Donghai Supply", en: "Donghai Supply", cityZh: "宁波", cityTh: "หนิงโป", cityEn: "Ningbo" },
  { zh: "深圳华运", th: "HuaYun SZ", en: "HuaYun Shenzhen", cityZh: "深圳", cityTh: "เซินเจิ้น", cityEn: "Shenzhen" },
  { zh: "曼谷精工", th: "Bangkok Precision", en: "Bangkok Precision", cityZh: "曼谷", cityTh: "กรุงเทพ", cityEn: "Bangkok" },
  { zh: "罗勇塑胶", th: "Rayong Plastics", en: "Rayong Plastics", cityZh: "罗勇", cityTh: "ระยอง", cityEn: "Rayong" },
  { zh: "上海联通物流", th: "Shanghai LianTong", en: "Shanghai LianTong", cityZh: "上海", cityTh: "เซี่ยงไฮ้", cityEn: "Shanghai" },
  { zh: "盐田港务代理", th: "Yantian Agency", en: "Yantian Agency", cityZh: "盐田", cityTh: "หยานเถียน", cityEn: "Yantian" },
  { zh: "林查班仓储", th: "LCB Warehouse Co", en: "LCB Warehouse Co", cityZh: "林查班", cityTh: "แหลมฉบัง", cityEn: "Laem Chabang" },
  { zh: "黄埔机电", th: "Huangpu Mech", en: "Huangpu Mech", cityZh: "黄埔", cityTh: "หวงผู่", cityEn: "Huangpu" },
  { zh: "春武里汽车件", th: "Chonburi Auto", en: "Chonburi Auto Parts", cityZh: "春武里", cityTh: "ชลบุรี", cityEn: "Chonburi" },
  { zh: "厦门海翔", th: "Xiamen Haixiang", en: "Xiamen Haixiang", cityZh: "厦门", cityTh: "เซี่ยเหมิน", cityEn: "Xiamen" },
  { zh: "青岛远航", th: "Qingdao Yuanhang", en: "Qingdao Yuanhang", cityZh: "青岛", cityTh: "ชิงเต่า", cityEn: "Qingdao" },
  { zh: "泰国建材进口", th: "Thai Building Imp", en: "Thai Building Import", cityZh: "曼谷", cityTh: "กรุงเทพ", cityEn: "Bangkok" },
  { zh: "佛山陶瓷出口", th: "Foshan Ceramics", en: "Foshan Ceramics", cityZh: "佛山", cityTh: "ฝอซาน", cityEn: "Foshan" },
  { zh: "合艾冷链", th: "Hatyai Cold Chain", en: "Hatyai Cold Chain", cityZh: "合艾", cityTh: "หาดใหญ่", cityEn: "Hatyai" },
];

export const LCS_CUSTOMERS: ShellCustomer[] = CUSTOMER_META.map((c, i) => {
  const lane = LANES[i % LANES.length]!;
  return {
    id: `sc-seed-${i + 1}`,
    nameZh: c.zh,
    nameTh: c.th,
    nameEn: c.en,
    cityZh: c.cityZh,
    cityTh: c.cityTh,
    cityEn: c.cityEn,
    laneZh: lane.laneZh,
    laneTh: `${lane.origin}→${lane.destination}`,
    laneEn: `${lane.origin}→${lane.destination}`,
    owner: OWNERS_SALES[i % OWNERS_SALES.length]!,
    updated: `09-${String((i % 28) + 1).padStart(2, "0")}`,
    taxId: i % 2 === 0 ? `0${1000000000000 + i}` : `TH${9000000000000 + i}`,
    billingAddress: `${c.cityEn} Industrial Zone, Unit ${i + 1}`,
    creditTerm: i % 3 === 0 ? "Net 45" : "Net 30",
    creditLimit: 50000 + i * 5000,
    portalPin: "demo",
  };
});

export const LCS_CONTACTS: ShellContact[] = LCS_CUSTOMERS.flatMap((c, i) => {
  const roles = [ROLES[i % ROLES.length]!, ROLES[(i + 2) % ROLES.length]!];
  return roles.map((role, j) => ({
    id: `sct-${i + 1}-${j + 1}`,
    customerId: c.id,
    name: j === 0 ? `${c.nameEn.split(" ")[0]} Contact` : `${c.nameEn} Acc`,
    title: role,
    email: `c${i + 1}${j}@example.com`,
    phone: `+66-8${i}${j}-0000`,
    wechat: `wx_${i}_${j}`,
    primary: j === 0,
    role,
  }));
});

const JOB_COUNT = 30;
const statuses: Array<ShellJob["status"]> = ["OPEN", "IN_PROGRESS", "IN_PROGRESS", "CLOSED"];
const billStatuses: Array<ShellJob["billingStatus"]> = ["UNBILLED", "INVOICED", "PARTIAL", "PAID"];

export const LCS_JOBS: ShellJob[] = Array.from({ length: JOB_COUNT }, (_, i) => {
  const lane = LANES[i % LANES.length]!;
  const customer = LCS_CUSTOMERS[i % LCS_CUSTOMERS.length]!;
  const status = statuses[i % statuses.length]!;
  const delayed = i % 7 === 0 || i % 11 === 0;
  const noOps = i % 9 === 0;
  const carrier = CARRIERS[i % CARRIERS.length]!;
  const sell = 1800 + (i % 8) * 220;
  const costBuy = Math.round(sell * 0.72);
  const doneCodes: Array<[string, string | null]> =
    status === "CLOSED"
      ? DEFAULT_MILESTONES.map((m) => [m.code, `2026-08-${String((i % 20) + 1).padStart(2, "0")}T10:00:00Z`])
      : status === "OPEN"
        ? [["QUOTE_ACCEPTED", "2026-09-01T08:00:00Z"]]
        : [
            ["QUOTE_ACCEPTED", "2026-09-01T08:00:00Z"],
            ["BOOKING", "2026-09-02T08:00:00Z"],
            ["CONTAINER", "2026-09-03T08:00:00Z"],
            ["GATE_IN", i % 2 === 0 ? "2026-09-05T08:00:00Z" : null],
          ];
  return {
    id: `sj-seed-${i + 1}`,
    jobNumber: `JOB-2609${String(i + 1).padStart(4, "0")}`,
    customerId: customer.id,
    quotationId: `sq-seed-${(i % 20) + 1}`,
    origin: lane.origin,
    destination: lane.destination,
    pol: lane.pol,
    pod: lane.pod,
    containerType: i % 3 === 0 ? "20GP" : "40HC",
    quantity: 1 + (i % 3),
    currency: "USD",
    status,
    charges: [
      { description: "Ocean freight", amount: sell - 200, currency: "USD" },
      { description: "THC", amount: 200, currency: "USD" },
    ],
    totalSell: sell,
    costs: [
      { id: `jc-${i}-1`, description: "Ocean buy", vendor: carrier, amount: costBuy, currency: "USD" },
      { id: `jc-${i}-2`, description: "Truck CY", vendor: "LCB Haulage", amount: 180 + (i % 5) * 20, currency: "USD" },
    ],
    notes:
      i % 4 === 0
        ? [{ id: `jn-${i}`, body: "Customer requested draft BL before Friday.", author: OWNERS_SALES[i % 4]!, createdAt: "2026-09-03" }]
        : [],
    milestones: ms(doneCodes),
    shipmentId: `ssh${i + 1}`,
    createdAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
    shipper: customer.nameZh,
    consignee: `${customer.nameEn} TH`,
    incoterm: i % 2 === 0 ? "FOB" : "CIF",
    carrier,
    vessel: `${carrier.split(" ")[0]} ${100 + i}`,
    voyage: `${String(40 + (i % 20)).padStart(3, "0")}E`,
    etd: `09-${String((i % 27) + 1).padStart(2, "0")}`,
    eta: `09-${String(((i + 7) % 27) + 1).padStart(2, "0")}`,
    salesOwner: OWNERS_SALES[i % OWNERS_SALES.length]!,
    opsOwner: noOps ? "" : OWNERS_OPS[i % (OWNERS_OPS.length - 1)]!,
    serviceType: "FCL",
    billingStatus: billStatuses[i % billStatuses.length]!,
    delayed,
  };
});

export const LCS_SHIPMENTS: ShellShipment[] = LCS_JOBS.map((j, i) => {
  const st: ShellShipmentStatus[] = ["booking", "gate_in", "sail", "arrived", "delivered"];
  return {
    id: `ssh${i + 1}`,
    customerId: j.customerId,
    jobId: j.id,
    bookingNo: `BK${260900 + i}`,
    bl: `BL${260900 + i}`,
    vessel: j.vessel,
    voyage: j.voyage,
    carrier: j.carrier,
    pol: j.pol,
    pod: j.pod,
    etd: j.etd,
    eta: j.eta,
    teu: j.quantity * (j.containerType === "20GP" ? 1 : 2),
    status: st[i % st.length]!,
    mode: "FCL",
  };
});

const BOX_STATUSES: ShellBoxStatus[] = [...SHELL_BOX_STATUSES];
const RISKS: ShellDemurrageRisk[] = ["none", "none", "watch", "risk"];

export const LCS_BOXES: ShellBox[] = Array.from({ length: 42 }, (_, i) => {
  const ship = LCS_SHIPMENTS[i % LCS_SHIPMENTS.length]!;
  const slot = ["A1", "A2", "B1", "B2", "C1", "C2"][i % 6]!;
  const risk = RISKS[i % RISKS.length]!;
  const status = BOX_STATUSES[i % BOX_STATUSES.length]!;
  return {
    id: `TCLU${String(1000000 + i).slice(1)}`,
    customerId: ship.customerId,
    shipmentId: ship.id,
    type: i % 4 === 0 ? "20GP" : "40HC",
    dir: i % 2 === 0 ? "in" : "out",
    status,
    ...yard(slot),
    eta: ship.eta,
    teu: i % 4 === 0 ? 1 : 2,
    bl: ship.bl,
    vessel: ship.vessel,
    pol: ship.pol,
    pod: ship.pod,
    seal: `SL${900000 + i}`,
    freeTimeDays: 5 + (i % 5),
    lastFreeDay: `09-${String(((i + 10) % 27) + 1).padStart(2, "0")}`,
    demurrageRisk: risk,
    carrier: ship.carrier,
    etaChanged: i % 8 === 0,
    coPending: i % 7 === 0,
    missingDoc: i % 9 === 0,
    customsPending: i % 10 === 0,
    notReturned: i % 11 === 0,
    statusHistory: [{ at: "2026-09-01", status, note: "seed" }],
  };
});

const QUOTE_STATUSES: ShellQuoteStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "SENT",
  "ACCEPTED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "SENT",
  "ACCEPTED",
  "EXPIRED",
];

export const LCS_QUOTES: ShellQuotation[] = Array.from({ length: 20 }, (_, i) => {
  const jobLike = LCS_JOBS[i % LCS_JOBS.length]!;
  const status = QUOTE_STATUSES[i % QUOTE_STATUSES.length]!;
  const sell = 1500 + i * 80;
  return {
    id: `sq-seed-${i + 1}`,
    quotationNumber: `Q-2609${String(i + 1).padStart(3, "0")}`,
    customerId: LCS_CUSTOMERS[i % LCS_CUSTOMERS.length]!.id,
    origin: jobLike.origin,
    destination: jobLike.destination,
    pol: jobLike.pol,
    pod: jobLike.pod,
    mode: "FCL",
    containerType: "40HC",
    quantity: 1 + (i % 2),
    currency: "USD",
    status,
    charges: [
      { description: "Ocean freight", sellAmount: sell - 150, currency: "USD" },
      { description: "Local charges", sellAmount: 150, currency: "USD" },
    ],
    totalSell: sell,
    validFrom: status === "EXPIRED" ? "2026-06-01" : "2026-08-01",
    validUntil: status === "EXPIRED" ? "2026-07-15" : "2026-12-31",
    revision: 1 + (i % 3),
    termsAndConditions: "FCL sea TH–CN shell terms.",
    createdAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
  };
});

export const LCS_INVOICES: ShellInvoice[] = Array.from({ length: 20 }, (_, i) => {
  const job = LCS_JOBS[i % LCS_JOBS.length]!;
  const statuses: ShellInvoice["status"][] = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "ISSUED"];
  const status = statuses[i % statuses.length]!;
  const total = job.totalSell;
  const overdue = i % 5 === 0 && status !== "PAID" && status !== "DRAFT";
  const balanceDue = status === "PAID" ? 0 : status === "PARTIALLY_PAID" ? Math.round(total / 2) : total;
  return {
    id: `si-seed-${i + 1}`,
    invoiceNumber: `INV-2609${String(i + 1).padStart(3, "0")}`,
    customerId: job.customerId,
    jobId: job.id,
    total,
    balanceDue,
    currency: "USD",
    status,
    createdAt: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
    dueDate: overdue ? "2026-08-15" : `2026-10-${String((i % 27) + 1).padStart(2, "0")}`,
    creditTermDays: 30,
    overdue,
    vatAmount: Math.round(total * 0.07 * 100) / 100,
    whtAmount: i % 4 === 0 ? Math.round(total * 0.03 * 100) / 100 : 0,
  };
});

const DOC_TYPES: ShellDocType[] = ["BOOKING", "BL", "CI", "PL", "CO", "DO", "POD", "OTHER"];

export const LCS_DOCS: ShellDocItem[] = LCS_JOBS.flatMap((j, i) => {
  const base: ShellDocItem[] = [
    {
      id: `sd-${i}-bk`,
      name: "Booking Confirmation",
      docType: "BOOKING",
      jobId: j.id,
      shipmentId: j.shipmentId,
      status: "ok",
      note: "",
      approval: "approved",
    },
    {
      id: `sd-${i}-bl`,
      name: "B/L",
      docType: "BL",
      jobId: j.id,
      shipmentId: j.shipmentId,
      status: i % 5 === 0 ? "wait" : "ok",
      note: i % 5 === 0 ? "Awaiting draft approval" : "",
      approval: i % 5 === 0 ? "pending" : "approved",
    },
  ];
  if (i % 4 === 0) {
    base.push({
      id: `sd-${i}-co`,
      name: "C/O",
      docType: "CO",
      jobId: j.id,
      shipmentId: j.shipmentId,
      status: "late",
      note: "Missing from shipper",
      approval: "none",
    });
  }
  if (i % 6 === 0) {
    base.push({
      id: `sd-${i}-pod`,
      name: "POD",
      docType: "POD",
      jobId: j.id,
      shipmentId: j.shipmentId,
      status: "wait",
      note: "Waiting warehouse stamp",
      approval: "pending",
    });
  }
  if (i % 8 === 0) {
    base.push({
      id: `sd-${i}-pl`,
      name: "Packing List",
      docType: "PL",
      jobId: j.id,
      status: "ok",
      note: "",
      approval: "approved",
    });
  }
  return base;
}).slice(0, 80);

export const LCS_VENDORS: ShellVendor[] = [
  { id: "sv-1", name: "COSCO Shipping", vendorType: "shipping_line", creditTerm: "Net 30" },
  { id: "sv-2", name: "MSC Agency", vendorType: "shipping_line", creditTerm: "Net 30" },
  { id: "sv-3", name: "LCB Haulage", vendorType: "trucking", creditTerm: "Net 15" },
  { id: "sv-4", name: "Thai Customs Broker", vendorType: "customs", creditTerm: "Net 7" },
  { id: "sv-5", name: "LCB Depot", vendorType: "depot", creditTerm: "Net 15" },
  { id: "sv-6", name: "Bangkok CFS", vendorType: "warehouse", creditTerm: "Net 30" },
  { id: "sv-7", name: "Evergreen Line", vendorType: "shipping_line", creditTerm: "Net 45" },
  { id: "sv-8", name: "Rayong Trucking", vendorType: "trucking", creditTerm: "Net 15" },
];

export const LCS_VENDOR_BILLS: ShellVendorBill[] = [
  {
    id: "svb-1",
    billNumber: "VB-260901",
    vendorId: "sv-1",
    vendorName: "COSCO Shipping",
    jobId: "sj-seed-1",
    amount: 1800,
    currency: "USD",
    status: "APPROVED",
    createdAt: "2026-09-01",
  },
  {
    id: "svb-2",
    billNumber: "VB-260902",
    vendorId: "sv-3",
    vendorName: "LCB Haulage",
    jobId: "sj-seed-2",
    amount: 220,
    currency: "USD",
    status: "DRAFT",
    createdAt: "2026-09-02",
  },
  {
    id: "svb-3",
    billNumber: "VB-260903",
    vendorId: "sv-4",
    vendorName: "Thai Customs Broker",
    amount: 150,
    currency: "USD",
    status: "DRAFT",
    createdAt: "2026-09-03",
  },
];

export const LCS_RATES: ShellRate[] = LANES.slice(0, 8).map((l, i) => {
  const buy = 1200 + i * 80;
  const sell = buy + 200 + (i % 3) * 50;
  return {
    id: `sr${i + 1}`,
    origin: l.origin,
    destination: l.destination,
    containerType: "40HC",
    mode: "FCL" as const,
    buyAmount: buy,
    sellAmount: sell,
    carrier: CARRIERS[i % CARRIERS.length]!,
    currency: "USD",
    validFrom: "2026-08-01",
    validUntil: "2026-12-31",
    localCharges: 120 + i * 10,
  };
});

export const LCS_TASKS: ShellTask[] = [
  { id: "st1", title: "Chase C/O for delayed jobs", jobId: "sj-seed-1", done: false, priority: "high" },
  { id: "st2", title: "Confirm demurrage risk boxes", done: false, priority: "high" },
  { id: "st3", title: "Follow up overdue AR", done: false, priority: "normal" },
  { id: "st4", title: "Assign ops owner gaps", done: false, priority: "high" },
];

void DOC_TYPES;
