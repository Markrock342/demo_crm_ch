import type { BillingPort } from "../../ports/billing.port.ts";
import { NotConfiguredError } from "../../ports/auth.port.ts";

export const billingStub: BillingPort = {
  async listInvoices() {
    return [];
  },
  async listBillingNotes() {
    return [];
  },
  async listPayments() {
    return [];
  },
};

export async function connectBillingRemote(): Promise<never> {
  throw new NotConfiguredError();
}
