import type { Contact, Deal, Lead } from "../crm";
import type { Customer } from "../data";

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => ({}));
  return data as Record<string, unknown>;
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error ?? `api_${res.status}`));
  return data;
}

export type CrmBundle = {
  customers: Customer[];
  contacts: Contact[];
  leads: Lead[];
  deals: Deal[];
};

export async function fetchCrmBundle(): Promise<CrmBundle> {
  const [custRes, contactRes, leadRes, dealRes] = await Promise.all([
    apiFetch("/api/customers?limit=200"),
    apiFetch("/api/contacts"),
    apiFetch("/api/leads"),
    apiFetch("/api/opportunities"),
  ]);
  return {
    customers: (custRes.items as Customer[]) ?? [],
    contacts: (contactRes.items as Contact[]) ?? [],
    leads: (leadRes.items as Lead[]) ?? [],
    deals: (dealRes.items as Deal[]) ?? [],
  };
}

export async function apiCreateCustomer(input: {
  nameZh: string;
  cityZh: string;
  laneZh: string;
  owner: string;
}): Promise<Customer> {
  return (await apiFetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })) as Customer;
}

export async function apiCreateContact(input: Omit<Contact, "id" | "primary"> & { primary?: boolean }) {
  return apiFetch("/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function apiCreateLead(input: Pick<Lead, "company" | "city" | "lane" | "contact" | "source" | "teu" | "owner">) {
  return apiFetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function apiCreateOpportunity(input: Pick<Deal, "customerId" | "title" | "lane" | "value" | "teu" | "close" | "owner">) {
  return apiFetch("/api/opportunities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function apiUpdateLeadStage(id: string, stage: string) {
  return apiFetch(`/api/leads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
}

export async function apiUpdateOpportunityStage(id: string, stage: string) {
  return apiFetch(`/api/opportunities/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
}
