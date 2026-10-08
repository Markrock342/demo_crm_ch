/**
 * Server-side paged lists (search / tabs / counts run in SQL) + bulk actions and CSV exports.
 * See server/services/{job,invoice,customer}-list.service.ts and server/routes/bulk.ts.
 */
import type { Customer } from "../data";
import type { JobRow } from "./commercial.ts";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const data: unknown = await res.json().catch(() => ({}));
  const body = data as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error ?? `api_${res.status}`));
  return data as T;
}

function qs(params: Record<string, string | number | undefined | null | false>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

const post = (path: string, body: unknown) =>
  apiFetch<Record<string, unknown>>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ── Jobs ─────────────────────────────────────────────────────────────── */

export const JOB_STAGE_KEYS = ["booked", "gatein", "sailed", "arrived", "customs", "delivered"] as const;
export type JobStageKey = (typeof JOB_STAGE_KEYS)[number];
export type JobStatusTab = "all" | "OPEN" | "IN_PROGRESS" | "CLOSED" | "delayed";

export type JobPageRow = JobRow & {
  stage: number;
  customerNameZh?: string | null;
  customerNameTh?: string | null;
  customerNameEn?: string | null;
};

export type JobListParams = {
  q?: string;
  status?: JobStatusTab;
  billing?: string;
  customerId?: string;
  stage?: JobStageKey | null;
  limit?: number;
  offset?: number;
  /** Board: first N per stage, late first then soonest ETA. */
  perStage?: number;
  sort?: "board";
};

export type JobPage = {
  items: JobPageRow[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<JobStatusTab, number>;
  stageCounts: Record<JobStageKey, number>;
};

function jobParams(p: JobListParams) {
  return {
    q: p.q?.trim(),
    status: p.status === "all" ? undefined : p.status,
    billing: p.billing,
    customerId: p.customerId,
    stage: p.stage ?? undefined,
    limit: p.limit,
    offset: p.offset,
    view: p.perStage ? "board" : undefined,
    perStage: p.perStage,
    sort: p.sort,
  };
}

export function fetchJobsPage(p: JobListParams) {
  return apiFetch<JobPage>(`/api/jobs${qs(jobParams(p))}`);
}

export const JOB_BULK_STATUSES = ["BOOKING", "GATE_IN", "SAIL", "ARRIVED", "DELIVERED"] as const;

export function bulkJobStatus(ids: string[], status: (typeof JOB_BULK_STATUSES)[number]) {
  return post("/api/bulk/jobs", { ids, action: "status", status }) as Promise<{ updated: number; unchanged: number }>;
}

export function bulkJobOwner(ids: string[], field: "sales" | "ops", userId: string | null) {
  return post("/api/bulk/jobs", { ids, action: "owner", field, userId }) as Promise<{ updated: number; unchanged: number }>;
}

export function jobsCsvUrl(p: JobListParams & { ids?: string[]; lang?: string }) {
  return `/api/exports/jobs.csv${qs({ ...jobParams({ ...p, perStage: undefined, limit: undefined, offset: undefined }), ids: p.ids?.join(","), lang: p.lang })}`;
}

/* ── Invoices ─────────────────────────────────────────────────────────── */

export type InvoiceView = "all" | "draft" | "open" | "overdue" | "paid";
export type InvoiceGroup = "overdue" | "soon" | "open" | "draft" | "paid";

export type InvoicePageRow = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId: string | null;
  jobNumber: string | null;
  customerNameZh: string | null;
  customerNameTh: string | null;
  customerNameEn: string | null;
  issueDate: string;
  dueDate: string;
  currency: string;
  total: string;
  paidAmount: string;
  balanceDue: string;
  status: string;
  group: InvoiceGroup | "other";
};

type Money = { currency: string; amount: number };
export type InvoiceSummary = {
  currencies: Array<{
    currency: string;
    billed: number;
    paid: number;
    due: number;
    overdue: number;
    aging: { notDue: number; d1_30: number; d31_60: number; d60: number };
  }>;
  open: { count: number; balance: Money[] };
  overdue: { count: number; balance: Money[] };
  week: { count: number; balance: Money[] };
};

export type InvoicePage = {
  items: InvoicePageRow[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<InvoiceView, number>;
  groupCounts: Record<InvoiceGroup, number>;
  summary: InvoiceSummary;
};

export type InvoiceListParams = {
  view?: InvoiceView;
  q?: string;
  customerId?: string;
  jobId?: string;
  limit?: number;
  offset?: number;
  perGroup?: number;
  group?: InvoiceGroup;
};

function invoiceParams(p: InvoiceListParams) {
  return {
    view: p.view === "all" ? undefined : p.view,
    q: p.q?.trim(),
    customerId: p.customerId,
    jobId: p.jobId,
    group: p.group,
    perGroup: p.perGroup,
    limit: p.limit ?? (p.perGroup ? undefined : 50),
    offset: p.offset,
  };
}

export function fetchInvoicesPage(p: InvoiceListParams) {
  return apiFetch<InvoicePage>(`/api/invoices${qs(invoiceParams(p))}`);
}

export function bulkIssueInvoices(ids: string[]) {
  return post("/api/bulk/invoices/issue", { ids }) as Promise<{
    issued: { id: string; invoiceNumber: string }[];
    skipped: { id: string; invoiceNumber: string; status: string }[];
  }>;
}

export function invoicesCsvUrl(p: InvoiceListParams & { ids?: string[]; lang?: string }) {
  return `/api/exports/invoices.csv${qs({ ...invoiceParams({ ...p, perGroup: undefined, limit: undefined, offset: undefined }), limit: undefined, ids: p.ids?.join(","), lang: p.lang })}`;
}

/* ── Customers ────────────────────────────────────────────────────────── */

export type CustomerTab = "all" | "active" | "ar";
export type CustomerMoney = { activeJobs: number; balance: number; currency: string; aging: { current: number; late: number; veryLate: number } };
export type CustomerPageRow = Customer & { boxes?: number; arDays?: number; ownerUserId?: string | null; businessUnits?: string[]; commodities?: string[]; money: CustomerMoney };
export type CustomerPage = {
  items: CustomerPageRow[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<CustomerTab, number>;
  owners: string[];
};

export function fetchCustomersPage(p: { q?: string; tab?: CustomerTab; owner?: string; unit?: string; limit?: number; offset?: number }) {
  return apiFetch<CustomerPage>(
    `/api/customers${qs({ stats: 1, q: p.q?.trim(), tab: p.tab === "all" ? undefined : p.tab, owner: p.owner, unit: p.unit, limit: p.limit ?? 50, offset: p.offset })}`,
  );
}

/** Lightweight customer search for pickers (id + names). */
export async function searchCustomers(q: string, limit = 20) {
  const data = await apiFetch<{ items: Customer[] }>(`/api/customers${qs({ q: q.trim(), limit })}`);
  return data.items ?? [];
}
