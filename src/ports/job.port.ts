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
  milestones: ShellJobMilestone[];
  shipmentId?: string;
  createdAt: string;
};

export type JobPort = {
  list(): Promise<ShellJob[]>;
  get(id: string): Promise<ShellJob | null>;
};

export { NotConfiguredError } from "./auth.port.ts";
