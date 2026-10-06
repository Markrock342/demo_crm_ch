import type { Contact, Deal, Lead } from "../crm";
import type { Customer } from "../data";

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => ({}));
  return data as Record<string, unknown>;
}

export type ApiIssue = { path: string; message: string };

/** API error with per-field issues (400 invalid_body). */
export class ApiError extends Error {
  status: number;
  issues: ApiIssue[];
  constructor(message: string, status: number, issues: ApiIssue[] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  const data = await readJson(res);
  if (!res.ok) throw new ApiError(String(data.error ?? `api_${res.status}`), res.status, (data.issues as ApiIssue[]) ?? []);
  return data;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/* ── Full customer record ─────────────────────────────── */

export type LanePair = { pol: string; pod: string };

/** Profile fields the API returns on every customer (all optional on legacy rows). */
export type CustomerProfile = {
  nameLangs: string[] | null;
  businessType: string | null;
  website: string | null;
  industry: string | null;
  leadSource: string | null;
  ownerUserId: string | null;
  status: string;
  notes: string | null;
  taxId: string | null;
  branchNo: string | null;
  billingAddress: string | null;
  country: string | null;
  currency: string | null;
  creditTermDays: number | null;
  creditLimit: number | null;
  paymentMethod: string | null;
  billingEmail: string | null;
  preferredLanes: LanePair[];
  containerTypes: string[];
  /** Business unit ids (ธุรกิจในเครือ) this customer uses. */
  businessUnits: string[];
  commodities: string[];
  incoterms: string | null;
  customsBroker: boolean | null;
  handlingNotes: string | null;
  createdAt: string;
  portalAccess: boolean;
};

export type CustomerRecord = Customer & Partial<CustomerProfile>;
export type CustomerDetail = Customer & CustomerProfile & { contacts: Contact[] };

export type ContactInput = {
  id?: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  wechat?: string | null;
  lineId?: string | null;
  primary?: boolean;
};

/** Body for POST /api/customers and PATCH /api/customers/:id. On PATCH, `contacts` is the full list. */
export type CustomerInput = {
  nameZh?: string | null;
  nameTh?: string | null;
  nameEn?: string | null;
  city?: string | null;
  laneZh?: string | null;
  laneTh?: string | null;
  laneEn?: string | null;
  businessType?: string | null;
  website?: string | null;
  industry?: string | null;
  leadSource?: string | null;
  ownerUserId?: string | null;
  status?: string;
  notes?: string | null;
  taxId?: string | null;
  branchNo?: string | null;
  billingAddress?: string | null;
  country?: string | null;
  currency?: string | null;
  creditTermDays?: number | null;
  creditLimit?: number | null;
  paymentMethod?: string | null;
  billingEmail?: string | null;
  preferredLanes?: LanePair[];
  containerTypes?: string[];
  businessUnits?: string[];
  commodities?: string[];
  incoterms?: string | null;
  customsBroker?: boolean | null;
  handlingNotes?: string | null;
  contacts?: ContactInput[];
};

export async function fetchCustomer(id: string): Promise<CustomerDetail> {
  return (await apiFetch(`/api/customers/${encodeURIComponent(id)}`)) as CustomerDetail;
}

export async function createCustomerRecord(input: CustomerInput): Promise<CustomerDetail> {
  return (await apiFetch("/api/customers", json("POST", input))) as CustomerDetail;
}

export async function updateCustomerRecord(id: string, patch: CustomerInput): Promise<CustomerDetail> {
  return (await apiFetch(`/api/customers/${encodeURIComponent(id)}`, json("PATCH", patch))) as CustomerDetail;
}

export async function apiUpdateContact(id: string, patch: Partial<Omit<ContactInput, "id">>): Promise<Contact> {
  return (await apiFetch(`/api/contacts/${encodeURIComponent(id)}`, json("PATCH", patch))) as Contact;
}

export async function apiDeleteContact(id: string): Promise<void> {
  await apiFetch(`/api/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type CrmBundle = {
  customers: Customer[];
  contacts: Contact[];
  leads: Lead[];
  deals: Deal[];
};

export function fetchCrmBundle(): Promise<CrmBundle> {
  return fetchCrmBundleFor({});
}

/** Same as fetchCrmBundle; `sales: false` skips leads / deals (sales module off for this company). */
export async function fetchCrmBundleFor(opts: { sales?: boolean }): Promise<CrmBundle> {
  // Leads / deals belong to the sales module; a company without it gets empty lists (403 module_disabled).
  const offIsEmpty = (e: unknown) => (e instanceof Error && e.message === "module_disabled" ? { items: [] } : Promise.reject(e));
  const [custRes, contactRes, leadRes, dealRes] = await Promise.all([
    apiFetch("/api/customers?limit=200"),
    apiFetch("/api/contacts"),
    opts.sales === false ? { items: [] } : apiFetch("/api/leads").catch(offIsEmpty),
    opts.sales === false ? { items: [] } : apiFetch("/api/opportunities").catch(offIsEmpty),
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

/* ── Customer portal access (staff) ───────────────────── */

/** Issues (or rotates) the portal access code. The plain code is returned only this once. */
export async function issuePortalAccessCode(customerId: string): Promise<{ customerId: string; code: string; emails: string[] }> {
  return (await apiFetch(`/api/portal/access-code/${encodeURIComponent(customerId)}`, { method: "POST" })) as {
    customerId: string;
    code: string;
    emails: string[];
  };
}

export async function revokePortalAccess(customerId: string): Promise<void> {
  await apiFetch(`/api/portal/access-code/${encodeURIComponent(customerId)}`, { method: "DELETE" });
}
