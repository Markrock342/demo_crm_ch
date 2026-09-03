import type { JobRow } from "../../api/commercial.ts";
import { DEFAULT_MILESTONES, type ShellBillingStatus, type ShellJob } from "../../ports/job.port.ts";

export type ApiJobDetail = {
  id: string;
  jobNumber: string;
  customerId: string;
  quotationId?: string | null;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode?: string;
  status: string;
  teu?: number;
  currency: string;
  carrier?: string | null;
  vessel?: string | null;
  voyage?: string | null;
  etd?: string | null;
  eta?: string | null;
  containerType?: string | null;
  containerCount?: number | null;
  incoterm?: string | null;
  assignedOperator?: string | null;
  salesOwnerId?: string | null;
  bookingId?: string | null;
  createdAt?: string | Date;
  milestoneAtRisk?: boolean;
};

function mapShellStatus(raw: string): ShellJob["status"] {
  const u = raw.toUpperCase();
  if (u === "DELIVERED" || u === "CLOSED" || u === "COMPLETED") return "CLOSED";
  if (u === "BOOKING" || u === "DRAFT" || u === "QUOTED") return "OPEN";
  return "IN_PROGRESS";
}

function emptyJob(partial: Partial<ShellJob> & Pick<ShellJob, "id" | "jobNumber" | "customerId">): ShellJob {
  return {
    quotationId: "",
    origin: "",
    destination: "",
    pol: "",
    pod: "",
    containerType: "40HC",
    quantity: 1,
    currency: "USD",
    status: "OPEN",
    charges: [],
    totalSell: 0,
    costs: [],
    notes: [],
    milestones: DEFAULT_MILESTONES.map((m) => ({ ...m })),
    createdAt: new Date().toISOString().slice(0, 10),
    shipper: "—",
    consignee: "—",
    incoterm: "FOB",
    carrier: "",
    vessel: "",
    voyage: "",
    etd: "—",
    eta: "—",
    salesOwner: "",
    opsOwner: "",
    serviceType: "FCL",
    billingStatus: "UNBILLED" as ShellBillingStatus,
    ...partial,
  };
}

/** Map list row (enriched) to ShellJob for UI tables. */
export function mapJobRowToShell(row: JobRow & Partial<ApiJobDetail>): ShellJob {
  return emptyJob({
    id: row.id,
    jobNumber: row.jobNumber,
    customerId: row.customerId,
    origin: row.origin,
    destination: row.destination,
    pol: row.pol,
    pod: row.pod,
    currency: row.currency,
    status: mapShellStatus(row.status),
    quantity: Math.max(1, Math.round((row.teu || 2) / 2)),
    carrier: row.carrier ?? "",
    vessel: row.vessel ?? "",
    voyage: row.voyage ?? "",
    etd: row.etd || "—",
    eta: row.eta || "—",
    containerType: row.containerType || "40HC",
    opsOwner: row.assignedOperator ?? "",
    salesOwner: row.salesOwnerId ?? "",
    incoterm: row.incoterm || "FOB",
    delayed: Boolean(row.milestoneAtRisk),
  });
}

export function mapApiJobDetailToShell(row: ApiJobDetail): ShellJob {
  return emptyJob({
    id: row.id,
    jobNumber: row.jobNumber,
    customerId: row.customerId,
    quotationId: row.quotationId ?? "",
    origin: row.origin,
    destination: row.destination,
    pol: row.pol,
    pod: row.pod,
    currency: row.currency,
    status: mapShellStatus(row.status),
    quantity: row.containerCount || Math.max(1, Math.round((row.teu || 2) / 2)),
    carrier: row.carrier ?? "",
    vessel: row.vessel ?? "",
    voyage: row.voyage ?? "",
    etd: row.etd || "—",
    eta: row.eta || "—",
    containerType: row.containerType || "40HC",
    opsOwner: row.assignedOperator ?? "",
    salesOwner: row.salesOwnerId ?? "",
    incoterm: row.incoterm || "FOB",
    createdAt:
      typeof row.createdAt === "string"
        ? row.createdAt.slice(0, 10)
        : row.createdAt
          ? row.createdAt.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
  });
}
