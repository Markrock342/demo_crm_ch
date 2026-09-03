import type { CrmPort } from "../../ports/crm.port.ts";

/** Remote CRM adapter — empty until configured. */
export const crmRemoteStub: CrmPort = {
  async listCustomers() {
    return [];
  },
  async listContacts() {
    return [];
  },
  async listLeads() {
    return [];
  },
  async listDeals() {
    return [];
  },
};
