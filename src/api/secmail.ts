/** Outbound e-mail actions + audit-log viewer API. */

export type ApiIssue = { path: string; message: string };

export class SecmailError extends Error {
  status: number;
  issues: ApiIssue[];
  detail: string | null;
  constructor(code: string, status: number, issues: ApiIssue[] = [], detail: string | null = null) {
    super(code);
    this.status = status;
    this.issues = issues;
    this.detail = detail;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new SecmailError(
      String(data.error ?? `api_${res.status}`),
      res.status,
      (data.issues as ApiIssue[]) ?? [],
      typeof data.detail === "string" ? data.detail : null,
    );
  }
  return data as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export type OutboundMail = {
  id: string;
  to: string[];
  cc: string[];
  subject: string;
  status: "sent" | "failed";
  error: string | null;
  transport: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: { filename: string; size: number }[];
};

export type DocKind = "invoice" | "billing_note";

export type DocEmailDraft = {
  kind: DocKind;
  id: string;
  number: string;
  customerName: string;
  to: string[];
  subject: string;
  body: string;
  attachment: string;
  history: OutboundMail[];
};

const docPath = (kind: DocKind, id: string) =>
  `/api/${kind === "invoice" ? "invoices" : "billing-notes"}/${encodeURIComponent(id)}/email`;

export function fetchDocEmailDraft(kind: DocKind, id: string) {
  return call<DocEmailDraft>(docPath(kind, id));
}

export function sendDocEmail(kind: DocKind, id: string, input: { to: string[]; cc: string[]; subject: string; body: string }) {
  return call<{ outbound: OutboundMail }>(docPath(kind, id), post(input));
}

export function emailPortalCode(customerId: string, code: string) {
  return call<{ sent: string[]; failed: { to: string; error: string | null }[] }>(
    `/api/customers/${encodeURIComponent(customerId)}/portal-code/email`,
    post({ code }),
  );
}

export type AuditChange = { field: string; from?: string | null; to?: string | null };
export type AuditRow = {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  user: { id: string; name: string; email: string } | null;
  changes: AuditChange[];
  created: boolean;
};

export type AuditQuery = {
  userId?: string;
  entityType?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export function fetchAuditLogs(query: AuditQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") p.set(k, String(v));
  return call<{ items: AuditRow[]; total: number; page: number; pageSize: number }>(`/api/audit-logs?${p}`);
}

export function fetchAuditFacets() {
  return call<{ users: { id: string; name: string; email: string }[]; entityTypes: string[]; actions: string[] }>("/api/audit-logs/facets");
}
