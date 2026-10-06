/** Notifications feed, automation rules and delivery channels (LINE). */

export type RuleKey =
  | "job_delayed"
  | "eta_changed"
  | "doc_missing"
  | "free_time"
  | "invoice_overdue"
  | "quote_expiring"
  | "case_assigned"
  | "case_sla";

export type AppNotification = {
  id: string;
  kind: RuleKey | string;
  title: string;
  body: string;
  params: Record<string, string | number | null>;
  refType: string | null;
  refId: string | null;
  href: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

export type AutomationRule = {
  key: RuleKey;
  enabled: boolean;
  channels: string[];
  lastRunAt: string | null;
  lastResult: { matched: number; created: number } | null;
};

export type RunResult = {
  ranAt: string;
  created: number;
  lineSent: number;
  byRule: Record<RuleKey, { matched: number; created: number }>;
};

export type LineChannel = {
  available: boolean;
  oaId: string | null;
  linked: boolean;
  linkedAt: string | null;
  enabled: boolean;
  code: string | null;
  codeExpiresAt: string | null;
};

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    credentials: "include",
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(String(data.error ?? `api_${res.status}`));
  return data;
}

export const fetchNotifications = () => call<{ items: AppNotification[]; unread: number }>("/api/notifications?limit=200");
export const fetchUnreadCount = () => call<{ unread: number }>("/api/notifications/unread-count").then((d) => d.unread);
export const markNotificationRead = (id: string) =>
  call<{ notification: AppNotification; unread: number }>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
export const markAllNotificationsRead = () => call<{ updated: number; unread: number }>("/api/notifications/read-all", { method: "POST" });

export const fetchAutomationRules = () => call<{ items: AutomationRule[]; lineAvailable: boolean }>("/api/automation/rules");
export const updateAutomationRule = (key: RuleKey, patch: { enabled?: boolean; channels?: string[] }) =>
  call<{ rule: AutomationRule }>(`/api/automation/rules/${key}`, { method: "PATCH", json: patch }).then((d) => d.rule);
export const runAutomationNow = () => call<{ result: RunResult; items: AutomationRule[] }>("/api/automation/run", { method: "POST" });

export const fetchLineChannel = () => call<{ line: LineChannel }>("/api/notifications/channels").then((d) => d.line);
export const createLineCode = () =>
  call<{ line: LineChannel }>("/api/notifications/channels/line/code", { method: "POST" }).then((d) => d.line);
export const setLineEnabled = (enabled: boolean) =>
  call<{ line: LineChannel }>("/api/notifications/channels/line", { method: "PATCH", json: { enabled } }).then((d) => d.line);
export const unlinkLine = () => call<{ line: LineChannel }>("/api/notifications/channels/line", { method: "DELETE" }).then((d) => d.line);
