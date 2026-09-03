import type { CrmDoc } from "../crm";
import type { Mail } from "../data";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  const data: unknown = await res.json().catch(() => ({}));
  const body = data as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error ?? `api_${res.status}`));
  return body;
}

export async function fetchMails(customerId?: string): Promise<Mail[]> {
  const q = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  const data = await apiFetch(`/api/mails${q}`);
  return (data.items as Mail[]) ?? [];
}

export async function apiCreateMail(input: Mail): Promise<Mail> {
  return (await apiFetch("/api/mails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })) as Mail;
}

export async function apiPatchMail(id: string, patch: Partial<Mail>): Promise<Mail> {
  return (await apiFetch(`/api/mails/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })) as Mail;
}

export async function fetchCrmDocs(customerId?: string): Promise<CrmDoc[]> {
  const q = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
  const data = await apiFetch(`/api/docs${q}`);
  return (data.items as CrmDoc[]) ?? [];
}

export async function apiPatchDocStatus(id: string, status: CrmDoc["status"]): Promise<CrmDoc> {
  return (await apiFetch(`/api/docs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })) as CrmDoc;
}

export async function apiUpsertDoc(doc: CrmDoc): Promise<CrmDoc> {
  return (await apiFetch("/api/docs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  })) as CrmDoc;
}
