/** To-dos (สิ่งที่ต้องทำ) and the customer / job activity log — /api/tasks, /api/activities. */

export type TaskPriority = "high" | "mid" | "low";
export type TaskStatus = "open" | "done";
export type ActivityType = "call" | "mail" | "meet" | "note" | "task";

export type TaskDto = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  done: boolean;
  ownerUserId: string | null;
  customerId: string | null;
  jobId: string | null;
  jobNumber: string | null;
  containerNo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityDto = {
  id: string;
  type: ActivityType;
  body: string;
  customerId: string | null;
  jobId: string | null;
  taskId: string | null;
  userId: string | null;
  occurredAt: string;
};

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type TaskListParams = {
  scope?: "mine" | "all";
  /** A user id, or "none" for unassigned. */
  owner?: string;
  customerId?: string;
  jobId?: string;
  status?: TaskStatus | "all";
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type TaskInput = {
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  priority?: TaskPriority;
  ownerUserId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  containerNo?: string | null;
};

export class ApiError extends Error {
  status: number;
  issues: { path: string; message: string }[];
  constructor(message: string, status: number, issues: { path: string; message: string }[] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(String(data.error ?? `api_${res.status}`), res.status, (data.issues as ApiError["issues"]) ?? []);
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function fetchTasks(params: TaskListParams = {}) {
  return call<Page<TaskDto>>(`/api/tasks${qs(params)}`);
}

export async function createTask(input: TaskInput) {
  return (await call<{ task: TaskDto }>("/api/tasks", { method: "POST", body: JSON.stringify(input) })).task;
}

export async function updateTask(id: string, patch: Partial<TaskInput> & { status?: TaskStatus }) {
  return (await call<{ task: TaskDto }>(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })).task;
}

export async function setTaskDone(id: string, done: boolean) {
  const path = `/api/tasks/${encodeURIComponent(id)}/${done ? "complete" : "reopen"}`;
  return (await call<{ task: TaskDto }>(path, { method: "POST" })).task;
}

export async function deleteTask(id: string) {
  await call(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchActivities(params: { customerId?: string; jobId?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) {
  return call<Page<ActivityDto>>(`/api/activities${qs(params)}`);
}

export async function createActivity(input: { type: ActivityType; body: string; customerId?: string | null; jobId?: string | null; occurredAt?: string | null }) {
  return (await call<{ activity: ActivityDto }>("/api/activities", { method: "POST", body: JSON.stringify(input) })).activity;
}

export async function deleteActivity(id: string) {
  await call(`/api/activities/${encodeURIComponent(id)}`, { method: "DELETE" });
}
