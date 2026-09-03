import { NotConfiguredError } from "./auth.port.ts";

export type ShellInvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID";

export type ShellInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId?: string;
  total: number;
  balanceDue: number;
  currency: string;
  status: ShellInvoiceStatus;
  createdAt: string;
  dueDate?: string;
  creditTermDays?: number;
  overdue?: boolean;
  vatAmount?: number;
  whtAmount?: number;
};

export type ShellBillingNote = {
  id: string;
  billingNumber: string;
  customerId: string;
  invoiceIds: string[];
  grandTotal: number;
  currency: string;
  createdAt: string;
};

export type ShellPayment = {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: string;
  createdAt: string;
};

export type BillingPort = {
  listInvoices(): Promise<ShellInvoice[]>;
  listBillingNotes(): Promise<ShellBillingNote[]>;
  listPayments(): Promise<ShellPayment[]>;
};

export { NotConfiguredError };
