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

export type PortalMe = {
  customerId: string;
  organizationId: string;
  nameZh: string;
  nameTh?: string | null;
  nameEn: string;
};

/** Contact e-mail + access code. Throws Error("invalid_credentials" | "too_many_attempts" | "unreachable" | …). */
export async function portalLogin(email: string, code: string) {
  let res: Response;
  try {
    res = await fetch("/api/portal/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
  } catch {
    throw new Error("unreachable");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401 || res.status === 400) throw new Error("invalid_credentials");
    if (res.status === 429) throw new Error("too_many_attempts");
    throw new Error(res.status >= 502 || !data.error ? "unreachable" : "server_error");
  }
  return data as { session: { customerId: string; organizationId: string } };
}

/** Current portal session, or null when not signed in. */
export async function fetchPortalMe(): Promise<PortalMe | null> {
  const res = await fetch("/api/portal/me", { credentials: "include" });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`api_${res.status}`);
  return (await res.json()) as PortalMe;
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
