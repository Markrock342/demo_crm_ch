/* Business units (ธุรกิจในเครือ / 业务板块) — /api/business-units. Tagged on cases, customers and LINE OAs. */
import { ApiError, type ApiIssue } from "./crm.ts";

export const UNIT_COLORS = ["teal", "blue", "amber", "violet", "rose", "slate"] as const;
export type UnitColor = (typeof UNIT_COLORS)[number];

export type BusinessUnit = { id: string; name: string; color: UnitColor | null; sortOrder: number; archived: boolean };
export type BusinessUnitInput = { name?: string; color?: UnitColor | null; sortOrder?: number; archived?: boolean };

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

/** Active units; `all` includes archived ones (settings screen). */
export const fetchBusinessUnits = async (all = false) =>
  (await apiFetch<{ items: BusinessUnit[] }>(`/api/business-units${all ? "?all=1" : ""}`)).items;
export const createBusinessUnit = async (input: { name: string; color?: UnitColor | null; sortOrder?: number }) =>
  (await apiFetch<{ item: BusinessUnit }>("/api/business-units", { method: "POST", body: JSON.stringify(input) })).item;
export const patchBusinessUnit = async (id: string, patch: BusinessUnitInput) =>
  (await apiFetch<{ item: BusinessUnit }>(`/api/business-units/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) })).item;
