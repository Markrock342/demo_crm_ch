export type ShellBoxStatus =
  | "waiting_booking"
  | "empty_pickup"
  | "stuffing"
  | "gate_in"
  | "loaded"
  | "in_transit"
  | "arrived"
  | "customs"
  | "do_ready"
  | "delivered"
  | "empty_returned"
  | "closed";

export type ShellBoxDir = "in" | "out";
export type ShellShipmentStatus = "booking" | "gate_in" | "sail" | "arrived" | "delivered";
export type ShellDemurrageRisk = "none" | "watch" | "risk";

export const SHELL_BOX_STATUSES: ShellBoxStatus[] = [
  "waiting_booking",
  "empty_pickup",
  "stuffing",
  "gate_in",
  "loaded",
  "in_transit",
  "arrived",
  "customs",
  "do_ready",
  "delivered",
  "empty_returned",
  "closed",
];

/** One-time map from Phase A statuses. */
export function mapLegacyBoxStatus(raw: string): ShellBoxStatus {
  const legacy: Record<string, ShellBoxStatus> = {
    yard: "gate_in",
    sail: "in_transit",
    clear: "customs",
    hold: "customs",
    empty: "empty_returned",
  };
  if (legacy[raw]) return legacy[raw]!;
  if ((SHELL_BOX_STATUSES as string[]).includes(raw)) return raw as ShellBoxStatus;
  return "waiting_booking";
}

export function boxInYard(status: ShellBoxStatus): boolean {
  return status === "gate_in" || status === "empty_returned" || status === "stuffing" || status === "empty_pickup";
}

export type ShellBoxStatusEvent = {
  at: string;
  status: ShellBoxStatus;
  note?: string;
};

export type ShellBox = {
  id: string;
  customerId: string;
  shipmentId?: string;
  type: string;
  dir: ShellBoxDir;
  status: ShellBoxStatus;
  yardZh: string;
  yardTh: string;
  yardEn: string;
  eta: string;
  teu: number;
  bl: string;
  vessel?: string;
  pol?: string;
  pod?: string;
  seal?: string;
  freeTimeDays?: number;
  lastFreeDay?: string;
  demurrageRisk?: ShellDemurrageRisk;
  carrier?: string;
  etaChanged?: boolean;
  coPending?: boolean;
  missingDoc?: boolean;
  customsPending?: boolean;
  notReturned?: boolean;
  statusHistory?: ShellBoxStatusEvent[];
};

export type ShellShipment = {
  id: string;
  customerId: string;
  jobId?: string;
  bookingNo: string;
  bl: string;
  vessel: string;
  voyage: string;
  carrier: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  teu: number;
  status: ShellShipmentStatus;
  mode: "FCL";
};

export type OpsPort = {
  listBoxes(): Promise<ShellBox[]>;
  listShipments(): Promise<ShellShipment[]>;
};

export { NotConfiguredError } from "./auth.port.ts";
