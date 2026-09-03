import { NotConfiguredError } from "./auth.port.ts";

export type ShellQuoteStatus = "DRAFT" | "PENDING_APPROVAL" | "SENT" | "ACCEPTED";

export type ShellQuoteCharge = {
  description: string;
  sellAmount: number;
  currency: string;
};

export type ShellQuotation = {
  id: string;
  quotationNumber: string;
  customerId: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  containerType: string;
  quantity: number;
  currency: string;
  status: ShellQuoteStatus;
  charges: ShellQuoteCharge[];
  totalSell: number;
  validUntil: string;
  termsAndConditions: string;
  createdAt: string;
};

export type QuotePort = {
  list(): Promise<ShellQuotation[]>;
  get(id: string): Promise<ShellQuotation | null>;
};

export { NotConfiguredError };
