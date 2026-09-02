import type { InvoiceRow, JobRow, QuotationRow, RateSearchRow } from "../api/commercial.ts";
import { shipments } from "../logistics.ts";
import { deals } from "../crm.ts";

export const demoRates: RateSearchRow[] = [
  {
    laneId: "demo-rl1",
    vendor: "MSC Mediterranean",
    carrier: "MSC",
    origin: "Shanghai",
    destination: "Laem Chabang",
    pol: "CNSHA",
    pod: "THLCH",
    mode: "SEA_FCL",
    containerType: "40HC",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    currency: "USD",
    totalBuy: null,
    totalSell: "977.50",
    margin: null,
    marginPct: null,
    status: "ACTIVE",
  },
  {
    laneId: "demo-rl2",
    vendor: "COSCO Shipping Lines",
    carrier: "COSCO",
    origin: "Yantian",
    destination: "Laem Chabang",
    pol: "CNYTN",
    pod: "THLCH",
    mode: "SEA_FCL",
    containerType: "40HC",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
    currency: "USD",
    totalBuy: null,
    totalSell: "897.00",
    margin: null,
    marginPct: null,
    status: "ACTIVE",
  },
];

export const demoJobs: JobRow[] = shipments.map((s, i) => ({
  id: s.id,
  jobNumber: `JOB-2026-${String(i + 1).padStart(6, "0")}`,
  customerId: s.customerId,
  origin: s.pol,
  destination: s.pod,
  pol: s.pol,
  pod: s.pod,
  mode: "SEA_FCL",
  status: s.status.toUpperCase(),
  teu: s.teu,
  currency: "THB",
}));

export const demoQuotations: QuotationRow[] = deals.slice(0, 4).map((d, i) => ({
  id: `demo-q${i}`,
  quotationNumber: `QT-2026-${String(i + 1).padStart(6, "0")}`,
  customerId: d.customerId,
  origin: d.lane.split("→")[0]?.trim() ?? "—",
  destination: d.lane.split("→")[1]?.trim() ?? "—",
  pol: "CNSHA",
  pod: "THLCH",
  mode: "SEA_FCL",
  containerType: "40HC",
  quantity: d.teu / 2 || 1,
  currency: "THB",
  status: d.stage === "quote" ? "DRAFT" : d.stage === "won" ? "APPROVED" : d.stage === "book" ? "ACCEPTED" : "SENT",
  currentRevision: 0,
  validUntil: d.close,
}));

export type DemoJobPnl = {
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  marginPct: string;
  revenue: Array<{ id: string; description: string; totalAmount: string; currency: string }>;
  cost: Array<{ id: string; description: string; totalAmount: string; currency: string }>;
};

export function demoJobPnl(jobId: string): DemoJobPnl {
  const seed = jobId.charCodeAt(jobId.length - 1) || 1;
  const rev = 45000 + seed * 1200;
  const cost = Math.round(rev * 0.72);
  const profit = rev - cost;
  const margin = ((profit / rev) * 100).toFixed(1);
  return {
    totalRevenue: String(rev),
    totalCost: String(cost),
    grossProfit: String(profit),
    marginPct: margin,
    revenue: [
      { id: "r1", description: "Ocean Freight", totalAmount: String(Math.round(rev * 0.82)), currency: "THB" },
      { id: "r2", description: "THC Destination", totalAmount: String(Math.round(rev * 0.12)), currency: "THB" },
      { id: "r3", description: "Documentation", totalAmount: String(Math.round(rev * 0.06)), currency: "THB" },
    ],
    cost: [
      { id: "c1", description: "Carrier Ocean Freight", totalAmount: String(Math.round(cost * 0.78)), currency: "THB" },
      { id: "c2", description: "THC Origin", totalAmount: String(Math.round(cost * 0.15)), currency: "THB" },
      { id: "c3", description: "Doc fee", totalAmount: String(Math.round(cost * 0.07)), currency: "THB" },
    ],
  };
}

export type DemoQuoteDetail = {
  quotation: QuotationRow;
  totals: { totalBuy: string | null; totalSell: string | null; grossProfit: string | null; marginPct: string | null };
  charges: Array<{ description: string; sellAmount: string; buyAmount?: string | null; currency: string }>;
};

export function demoQuotationDetail(id: string): DemoQuoteDetail | null {
  const quotation = demoQuotations.find((q) => q.id === id);
  if (!quotation) return null;
  const sell = 48000 + quotation.quantity * 1950;
  const buy = Math.round(sell * 0.73);
  const profit = sell - buy;
  return {
    quotation,
    totals: {
      totalBuy: String(buy),
      totalSell: String(sell),
      grossProfit: String(profit),
      marginPct: ((profit / sell) * 100).toFixed(1),
    },
    charges: [
      { description: "Ocean Freight", sellAmount: String(Math.round(sell * 0.78)), buyAmount: String(Math.round(buy * 0.8)), currency: quotation.currency },
      { description: "THC Destination", sellAmount: String(Math.round(sell * 0.14)), buyAmount: String(Math.round(buy * 0.12)), currency: quotation.currency },
      { description: "Documentation", sellAmount: String(Math.round(sell * 0.08)), buyAmount: String(Math.round(buy * 0.08)), currency: quotation.currency },
    ],
  };
}

export const demoInvoices: InvoiceRow[] = demoJobs.slice(0, 3).map((j, i) => {
  const total = 42000 + i * 8500;
  const paid = i === 2 ? total : i === 1 ? Math.round(total * 0.4) : 0;
  const balance = total - paid;
  return {
    id: `demo-inv${i}`,
    invoiceNumber: `INV-2026-${String(i + 1).padStart(6, "0")}`,
    customerId: j.customerId,
    jobId: j.id,
    total: String(total),
    balanceDue: String(balance),
    paidAmount: String(paid),
    currency: "THB",
    status: paid === 0 ? "ISSUED" : paid >= total ? "PAID" : "PARTIALLY_PAID",
    dueDate: "2026-03-15",
  };
});

export const demoBillingNotes = [
  { id: "demo-bn1", billingNumber: "BN-2026-000001", grandTotal: "42000", currency: "THB" },
];

export const demoAr: Record<string, string> = {
  total: "127500",
  d1_30: "84000",
  d31_60: "43500",
  d90plus: "0",
};
