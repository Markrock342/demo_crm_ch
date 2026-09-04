async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  const data: unknown = await res.json().catch(() => ({}));
  const body = data as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error ?? `api_${res.status}`));
  return body;
}

export type PortalJobRow = {
  id: string;
  jobNumber: string;
  origin?: string;
  destination?: string;
  pol: string;
  pod: string;
  status: string;
  etd?: string | null;
  eta?: string | null;
  carrier?: string | null;
};

export type PortalInvoiceRow = {
  id: string;
  invoiceNumber: string;
  total: string;
  balanceDue: string;
  currency: string;
  status: string;
  jobId?: string | null;
};

export type PortalDocRow = {
  id: string;
  kind: string;
  name: string;
  status: string;
  customerId: string;
};

export async function portalLogin(customerId: string, pin?: string) {
  return apiFetch("/api/portal/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, pin }),
  }) as Promise<{ session: { customerId: string; organizationId: string } }>;
}

export async function portalLogout() {
  return apiFetch("/api/portal/logout", { method: "POST" });
}

export async function fetchPortalJobs(): Promise<PortalJobRow[]> {
  const data = await apiFetch("/api/portal/jobs");
  return (data.items as PortalJobRow[]) ?? [];
}

export async function fetchPortalInvoices(): Promise<PortalInvoiceRow[]> {
  const data = await apiFetch("/api/portal/invoices");
  return (data.items as PortalInvoiceRow[]) ?? [];
}

export async function fetchPortalDocs(): Promise<PortalDocRow[]> {
  const data = await apiFetch("/api/portal/docs");
  return (data.items as PortalDocRow[]) ?? [];
}
