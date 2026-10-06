/** Marketing analytics — /api/marketing/* (read-only aggregates + segment contact export). */

export type Period = "month" | "quarter" | "year" | "custom";
export type RangeQuery = { period?: Period; from?: string; to?: string };

export type OwnerRef = { key: string; userId: string | null; name: string; nameZh: string | null; nameTh: string | null };
export type MoneyLine = { currency: string; value: number };

export type FunnelKey = "leads" | "qualified" | "sent" | "accepted" | "jobs";
export type SourceKey =
  | "exhibition"
  | "referral"
  | "website"
  | "line"
  | "facebook"
  | "phone"
  | "email"
  | "association"
  | "social"
  | "cold_call"
  | "existing"
  | "other";

export type MarketingOverview = {
  range: { period: Period; from: string; to: string };
  funnel: { key: FunnelKey; count: number; rate: number | null }[];
  sources: { key: SourceKey; raw: string[]; leads: number; won: number; wonRate: number | null }[];
  pipeline: {
    byStage: { stage: string; deals: number; values: MoneyLine[] }[];
    byOwner: { owner: OwnerRef; openDeals: number; wonDeals: number; open: MoneyLine[] }[];
    open: MoneyLine[];
    openDeals: number;
  };
  quotations: {
    sent: number;
    accepted: number;
    rejected: number;
    expired: number;
    waiting: number;
    acceptanceRate: number | null;
    winRate: number | null;
    avgDaysToClose: number | null;
    topLanes: { pol: string; pod: string; quotes: number; accepted: number }[];
  };
  customers: { newCount: number; active: number; atRisk: number; growth: { month: string; count: number }[] };
  leads: { total: number; qualified: number; conversion: number | null };
};

export type CustomerNames = { id: string; nameZh: string; nameTh: string; nameEn: string };

export type AtRiskRow = CustomerNames & {
  owner: OwnerRef;
  lastAt: string | null;
  daysSince: number | null;
  contact: { name: string; phone: string; email: string } | null;
  openTasks: number;
};

export type Recency = "d30" | "d90" | "dormant" | "never";
export type Size = "none" | "small" | "medium" | "large";

export type SegmentFilter = {
  pol?: string;
  pod?: string;
  businessType?: string;
  industry?: string;
  owner?: string;
  recency?: Recency;
  size?: Size;
  q?: string;
};

export type SegmentRow = CustomerNames & {
  businessType: string | null;
  industry: string | null;
  owner: OwnerRef;
  jobs: number;
  lastAt: string | null;
  lane: { pol: string; pod: string } | null;
  contact: { name: string; email: string; phone: string } | null;
  contacts: number;
};

export type SegmentOptions = { pols: string[]; pods: string[]; businessTypes: string[]; industries: string[]; owners: OwnerRef[] };

export class MarketingApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new MarketingApiError(String(data.error ?? `api_${res.status}`), res.status);
  return data as T;
}

function qs(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

const rangeParams = (r: RangeQuery) => (r.period === "custom" ? { from: r.from, to: r.to } : { period: r.period });

export function fetchMarketingOverview(r: RangeQuery) {
  return call<MarketingOverview>(`/api/marketing/overview${qs(rangeParams(r))}`);
}

export function fetchAtRisk(params: { limit?: number; offset?: number } = {}) {
  return call<{ items: AtRiskRow[]; total: number; limit: number; offset: number }>(`/api/marketing/at-risk${qs(params)}`);
}

export function fetchSegmentOptions() {
  return call<SegmentOptions>("/api/marketing/segments/options");
}

export function fetchSegment(f: SegmentFilter, page: { limit?: number; offset?: number } = {}) {
  return call<{ items: SegmentRow[]; total: number; reachable: number; limit: number; offset: number }>(
    `/api/marketing/segments${qs({ ...f, ...page })}`,
  );
}

/** Download the segment's contacts as CSV (the browser saves the file). Returns the row count. */
export async function downloadSegmentCsv(f: SegmentFilter, lang: "zh" | "th" | "en") {
  const res = await fetch(`/api/marketing/segments/contacts.csv${qs({ ...f, lang })}`, { credentials: "include" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new MarketingApiError(data.error ?? `api_${res.status}`, res.status);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "segment-contacts.csv";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return Number(res.headers.get("x-row-count") ?? 0);
}
