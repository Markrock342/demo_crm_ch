export type ShellJobMilestone = {
  code: string;
  label: string;
  actualAt: string | null;
};

export type ShellJobCharge = {
  description: string;
  amount: number;
  currency: string;
};

export type ShellJobCost = {
  id: string;
  description: string;
  vendor: string;
  vendorId?: string;
  amount: number;
  currency: string;
};

export type ShellJobNote = {
  id: string;
  body: string;
  author: string;
  createdAt: string;
};

export type ShellBillingStatus = "UNBILLED" | "INVOICED" | "PARTIAL" | "PAID";

export const DEFAULT_MILESTONES: ShellJobMilestone[] = [
  { code: "QUOTE_ACCEPTED", label: "Quotation accepted", actualAt: null },
  { code: "BOOKING", label: "Booking created", actualAt: null },
  { code: "CONTAINER", label: "Container assigned", actualAt: null },
  { code: "GATE_IN", label: "Gate in", actualAt: null },
  { code: "SAILED", label: "Departed", actualAt: null },
  { code: "ARRIVED", label: "Arrived POD", actualAt: null },
  { code: "DO", label: "DO issued", actualAt: null },
  { code: "DELIVERED", label: "Delivered", actualAt: null },
  { code: "POD", label: "POD received", actualAt: null },
  { code: "INVOICED", label: "Invoice issued", actualAt: null },
  { code: "PAID", label: "Payment received", actualAt: null },
];

export type ShellJob = {
  id: string;
  jobNumber: string;
  customerId: string;
  quotationId: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  containerType: string;
  quantity: number;
  currency: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  charges: ShellJobCharge[];
  totalSell: number;
  costs: ShellJobCost[];
  notes: ShellJobNote[];
  milestones: ShellJobMilestone[];
  shipmentId?: string;
  createdAt: string;
  shipper: string;
  consignee: string;
  incoterm: string;
  carrier: string;
  vessel: string;
  voyage: string;
  etd: string;
  eta: string;
  salesOwner: string;
  opsOwner: string;
  serviceType: "FCL";
  billingStatus: ShellBillingStatus;
  delayed?: boolean;
};

export function jobTotalCost(job: ShellJob): number {
  return job.costs.reduce((n, c) => n + c.amount, 0);
}

export function jobGrossProfit(job: ShellJob): number {
  return job.totalSell - jobTotalCost(job);
}

export function jobMarginPct(job: ShellJob): number {
  if (!job.totalSell) return 0;
  return Math.round((jobGrossProfit(job) / job.totalSell) * 1000) / 10;
}

export type JobPort = {
  list(): Promise<ShellJob[]>;
  get(id: string): Promise<ShellJob | null>;
};

export { NotConfiguredError } from "./auth.port.ts";
