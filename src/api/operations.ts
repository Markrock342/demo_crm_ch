async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  const data: unknown = await res.json().catch(() => ({}));
  const body = data as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error ?? `api_${res.status}`));
  return body;
}

export type ContainerDto = {
  id: string;
  jobId: string | null;
  customerId: string;
  containerNo: string;
  type: string;
  status: string;
  direction: string;
  bl: string | null;
  pol: string | null;
  pod: string | null;
  teu: number;
  eta: string | null;
  yardCode: string | null;
  vessel: string | null;
  seal: string | null;
  commodity: string | null;
};

export async function fetchContainers(params?: { status?: string; customerId?: string; jobId?: string; yard?: boolean }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.customerId) q.set("customerId", params.customerId);
  if (params?.jobId) q.set("jobId", params.jobId);
  if (params?.yard) q.set("yard", "1");
  const qs = q.toString();
  const data = await apiFetch(`/api/containers${qs ? `?${qs}` : ""}`);
  return (data.items as ContainerDto[]) ?? [];
}

export async function createContainerApi(input: {
  customerId: string;
  containerNo: string;
  type: string;
  direction: "in" | "out";
  status?: string;
  bl?: string;
  yardCode?: string;
  teu?: number;
  eta?: string;
}) {
  return apiFetch("/api/containers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<ContainerDto>;
}

export async function patchContainerApi(
  id: string,
  patch: { status?: string; yardCode?: string; bl?: string; eta?: string | null; vessel?: string | null },
) {
  return apiFetch(`/api/containers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }) as Promise<ContainerDto>;
}

export type MilestoneDto = {
  id: string;
  jobId: string;
  code: string;
  label: string;
  plannedAt: string | null;
  actualAt: string | null;
  sortOrder: number;
};

export async function fetchJobMilestones(jobId: string) {
  const data = await apiFetch(`/api/jobs/${jobId}/milestones`);
  return (data.items as MilestoneDto[]) ?? [];
}

export async function patchJobMilestone(jobId: string, code: string, complete: boolean) {
  return apiFetch(`/api/jobs/${jobId}/milestones/${code}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ complete }),
  }) as Promise<MilestoneDto>;
}

export type JobTaskDto = {
  id: string;
  jobId: string;
  title: string;
  dueAt: string | null;
  owner: string;
  priority: string;
  done: boolean;
};

export async function fetchJobTasks(jobId: string) {
  const data = await apiFetch(`/api/jobs/${jobId}/tasks`);
  return (data.items as JobTaskDto[]) ?? [];
}

export async function createJobTaskApi(jobId: string, input: { title: string; owner?: string; priority?: string; dueAt?: string | null }) {
  return apiFetch(`/api/jobs/${jobId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<JobTaskDto>;
}

export async function patchJobTaskApi(jobId: string, taskId: string, patch: Partial<{ title: string; done: boolean; priority: string }>) {
  return apiFetch(`/api/jobs/${jobId}/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }) as Promise<JobTaskDto>;
}

export async function uploadDocFile(docId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/docs/${docId}/upload`, { method: "POST", credentials: "include", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((data as { error?: string }).error ?? `upload_${res.status}`));
  return data;
}
