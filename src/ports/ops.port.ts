export type ShellBoxStatus = "yard" | "sail" | "clear" | "hold" | "empty";
export type ShellBoxDir = "in" | "out";
export type ShellShipmentStatus = "booking" | "gate_in" | "sail" | "arrived" | "delivered";
export type ShellDemurrageRisk = "none" | "watch" | "risk";

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
