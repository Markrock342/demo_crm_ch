/* Customer service cases (เคส / 工单) — /api/cases, canned replies, SLA, status lookup, LINE inbox. */
import type { UnitColor } from "./businessUnits.ts";
import { ApiError, type ApiIssue } from "./crm.ts";

export const CASE_STATUSES = ["new", "in_progress", "waiting_customer", "resolved", "closed"] as const;
export const CASE_OPEN_STATUSES = ["new", "in_progress", "waiting_customer"] as const;
export const CASE_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export const CASE_CATEGORIES = ["status_inquiry", "documents", "pricing", "complaint", "other"] as const;
export const CASE_CHANNELS = ["phone", "email", "line", "walk_in", "portal"] as const;
export const CANNED_VARIABLES = ["customer", "container", "eta", "vessel", "job", "agent"] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CasePriority = (typeof CASE_PRIORITIES)[number];
export type CaseCategory = (typeof CASE_CATEGORIES)[number];
export type CaseChannel = (typeof CASE_CHANNELS)[number];
export type CannedVariable = (typeof CANNED_VARIABLES)[number];

export type SlaState = "ok" | "warning" | "breached" | "met" | "late" | "none";
export type SlaTimer = { state: SlaState; dueAt: string | null; doneAt: string | null; leftMinutes: number | null; fractionLeft: number | null };

export type CaseDto = {
  id: string;
  caseNo: string;
  subject: string;
  description: string | null;
  channel: CaseChannel;
  category: CaseCategory;
  priority: CasePriority;
  status: CaseStatus;
  customerId: string | null;
  customer: { th: string; en: string; zh: string } | null;
  contactId: string | null;
  contact: { name: string; email: string; phone: string } | null;
  assigneeUserId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  containerNo: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  sourceMailId: string | null;
  businessUnitId: string | null;
  businessUnit: { id: string; name: string; color: UnitColor | null; imageUrl: string | null } | null;
  lineContactId: string | null;
  /** The customer's LINE chat this case is answered in (replies via "line" are pushed there; connected=false → only logged). */
  line: { displayName: string | null; pictureUrl: string | null; channelId: string; channelName: string; connected: boolean } | null;
  firstResponseDueAt: string | null;
  resolveDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  sla: { first: SlaTimer; resolve: SlaTimer; active: "first" | "resolve" | null; state: SlaState; breached: boolean };
};

export type CaseEventDto = {
  id: string;
  /** inbound = a message from the customer (LINE): data { via: "line", kind, channel, media?: { mime, size } | { url, mime } }
   *  (media.url = a built-in sample photo under /demo/ — show it directly; otherwise use caseMediaUrl).
   *  reply via line: data { via: "line", channel, delivery: "sent" | "failed" | "not_connected", error }. */
  type: "created" | "comment" | "reply" | "inbound" | "status" | "assignment" | "priority" | "category" | "link";
  body: string | null;
  data: Record<string, unknown>;
  userId: string | null;
  mailId: string | null;
  createdAt: string;
};

export type CaseContact = { id: string; name: string; title: string; email: string; phone: string; lineId: string; primary: boolean };
export type CaseDetail = { case: CaseDto; events: CaseEventDto[]; contacts: CaseContact[] };

export type CaseCounts = Record<CaseStatus, number>;
export type CasePage = { items: CaseDto[]; total: number; limit: number; offset: number; counts: CaseCounts };

export type CaseStats = {
  open: number;
  mine: number;
  unassigned: number;
  overdue: number;
  dueToday: number;
  resolvedToday: number;
  avgFirstResponseMinutes: number | null;
  firstResponseMetRate: number | null;
  byCategory: Record<CaseCategory, number>;
  byPriority: Record<CasePriority, number>;
  /** Open cases per business unit id ("none" = untagged). */
  byUnit: Record<string, number>;
  byChannel: Record<CaseChannel, number>;
};

export type CaseListParams = {
  status?: CaseStatus | "open" | "board" | "all";
  assignee?: string;
  priority?: CasePriority;
  category?: CaseCategory;
  customerId?: string;
  jobId?: string;
  /** Business unit id, or "none". */
  unit?: string;
  channel?: CaseChannel;
  overdue?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
};

export type CaseInput = {
  subject: string;
  description?: string | null;
  channel?: CaseChannel;
  category?: CaseCategory;
  priority?: CasePriority;
  customerId?: string | null;
  contactId?: string | null;
  assigneeUserId?: string | null;
  jobId?: string | null;
  containerNo?: string | null;
  bookingId?: string | null;
  sourceMailId?: string | null;
  businessUnitId?: string | null;
};

export type CasePatch = Partial<Omit<CaseInput, "sourceMailId">> & { status?: CaseStatus };

export type ReplyInput = {
  via: "email" | "phone" | "line";
  body: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  status?: CaseStatus;
};

export type ReplyResult = {
  event: CaseEventDto;
  mail: { id: string; status: "sent" | "failed"; error: string | null; to: string[]; cc: string[]; subject: string } | null;
  line: { delivery: "sent" | "failed" | "not_connected"; error: string | null; channel: string } | null;
  case: CaseDto;
};

export type CannedReply = { id: string; title: string; body: string; category: CaseCategory | null; sortOrder: number; updatedAt: string };
export type CannedInput = { title: string; body: string; category?: CaseCategory | null; sortOrder?: number };
export type CannedRender = { text: string; missing: CannedVariable[]; values: Partial<Record<CannedVariable, string | null>> };

export type SlaPolicy = Record<CasePriority, { firstResponseMinutes: number; resolveMinutes: number }>;

export type LookupHit = {
  kind: "container" | "job" | "booking";
  ref: string;
  jobId: string | null;
  jobNumber: string | null;
  containerNo: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  customerId: string | null;
  customer: { th: string; en: string; zh: string } | null;
  pol: string | null;
  pod: string | null;
  vessel: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  status: string;
  stage: number;
  problem: boolean;
  containers: string[];
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `api_${res.status}`), res.status, (data.issues as ApiIssue[]) ?? []);
  return data as T;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === false) continue;
    q.set(k, v === true ? "1" : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const enc = encodeURIComponent;
const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });

export const fetchCases = (p: CaseListParams = {}) => apiFetch<CasePage>(`/api/cases${qs(p)}`);
export const fetchCaseStats = () => apiFetch<CaseStats>("/api/cases/stats");
export const fetchCase = (id: string) => apiFetch<CaseDetail>(`/api/cases/${enc(id)}`);
export const createCase = async (input: CaseInput) => (await apiFetch<{ case: CaseDto }>("/api/cases", body("POST", input))).case;
export const patchCase = async (id: string, patch: CasePatch) =>
  (await apiFetch<{ case: CaseDto }>(`/api/cases/${enc(id)}`, body("PATCH", patch))).case;
export const addCaseNote = async (id: string, text: string) =>
  (await apiFetch<{ event: CaseEventDto }>(`/api/cases/${enc(id)}/notes`, body("POST", { body: text }))).event;
export const replyToCase = (id: string, input: ReplyInput) => apiFetch<ReplyResult>(`/api/cases/${enc(id)}/reply`, body("POST", input));

export const fetchCanned = async () => (await apiFetch<{ items: CannedReply[] }>("/api/cases/canned")).items;
export const createCanned = async (input: CannedInput) => (await apiFetch<{ item: CannedReply }>("/api/cases/canned", body("POST", input))).item;
export const patchCanned = async (id: string, patch: Partial<CannedInput>) =>
  (await apiFetch<{ item: CannedReply }>(`/api/cases/canned/${enc(id)}`, body("PATCH", patch))).item;
export const deleteCanned = (id: string) => apiFetch(`/api/cases/canned/${enc(id)}`, { method: "DELETE" });
export const renderCanned = (input: { caseId: string; cannedId?: string; body?: string; lang?: string }) =>
  apiFetch<CannedRender>("/api/cases/canned/render", body("POST", input));

export const fetchSlaPolicy = async () => (await apiFetch<{ policy: SlaPolicy }>("/api/cases/sla")).policy;
export const saveSlaPolicy = async (policy: Partial<SlaPolicy>) => (await apiFetch<{ policy: SlaPolicy }>("/api/cases/sla", body("PUT", policy))).policy;

export const lookupShipments = async (q: string) => (await apiFetch<{ items: LookupHit[] }>(`/api/cases/lookup${qs({ q })}`)).items;

/** URL of a picture / file a customer sent on LINE (event.data.media present). */
export const caseMediaUrl = (caseId: string, eventId: string) => `/api/cases/${enc(caseId)}/media/${enc(eventId)}`;

// ---- LINE inbox: company OAs → cases ----------------------------------------------

export type LineChannel = {
  id: string;
  name: string;
  basicId: string | null;
  businessUnitId: string | null;
  /** Instant reply when a chat opens a case; {case} = case number. */
  ackMessage: string | null;
  active: boolean;
  /** Secret + token saved → real LINE traffic. Otherwise only the test sender feeds it. */
  connected: boolean;
  /** A channel secret is saved (it is never sent back). */
  hasSecret: boolean;
  tokenHint: string | null;
  /** Prefix with the site origin for the LINE Developers console "Webhook URL". */
  webhookPath: string;
  lastEventAt: string | null;
  friends: number;
  openCases: number;
};

/** channelSecret / accessToken: non-empty replaces, null clears, omitted keeps. Never returned by the API. */
export type LineChannelInput = {
  name?: string;
  basicId?: string | null;
  channelSecret?: string | null;
  accessToken?: string | null;
  businessUnitId?: string | null;
  ackMessage?: string | null;
  active?: boolean;
};

export const fetchLineChannels = async () => (await apiFetch<{ items: LineChannel[] }>("/api/cases/line/channels")).items;
export const createLineChannel = async (input: LineChannelInput) =>
  (await apiFetch<{ item: LineChannel }>("/api/cases/line/channels", body("POST", input))).item;
export const patchLineChannel = async (id: string, patch: LineChannelInput) =>
  (await apiFetch<{ item: LineChannel }>(`/api/cases/line/channels/${enc(id)}`, body("PATCH", patch))).item;
export const deleteLineChannel = (id: string) => apiFetch(`/api/cases/line/channels/${enc(id)}`, { method: "DELETE" });
/** Acts like a customer chatting on that OA (nothing goes to LINE) → the case it opened / joined. */
/** Sample photos the test sender can attach (public/demo/chat-<key>.webp). */
export const DEMO_CHAT_IMAGES = ["truck-queue", "container-damage", "receipt", "container-seal"] as const;
export type DemoChatImage = (typeof DEMO_CHAT_IMAGES)[number];

export const sendLineTestMessage = (id: string, input: { name: string; text: string; image?: DemoChatImage }) =>
  apiFetch<{ caseId: string; caseNo: string; created: boolean }>(`/api/cases/line/channels/${enc(id)}/test-message`, body("POST", input));
