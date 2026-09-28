/* Leads + deals with a staff owner (ownerUserId) and deal currency — /api/leads, /api/opportunities. */
import type { DealStage, LeadStage } from "../crm";
import { ApiError, type ApiIssue } from "./crm.ts";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(data.error ?? `api_${res.status}`), res.status, (data.issues as ApiIssue[]) ?? []);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export type LeadRow = {
  id: string;
  company: string;
  city: string;
  lane: string;
  contact: string;
  source: string;
  stage: LeadStage;
  teu: number;
  /** Display name (legacy fallback when ownerUserId is empty). */
  owner: string;
  ownerUserId: string | null;
  updated: string;
};

export type DealRow = {
  id: string;
  customerId: string;
  title: string;
  lane: string;
  stage: DealStage;
  value: number;
  currency: string;
  teu: number;
  close: string;
  owner: string;
  ownerUserId: string | null;
};

export type LeadInput = { company: string; city?: string; lane?: string; contact?: string; source?: string; teu?: number; ownerUserId?: string | null };
export type DealInput = { customerId: string; title: string; lane?: string; value?: number; currency?: string; teu?: number; close?: string; ownerUserId?: string | null };

export async function fetchLeadRows() {
  return (await apiFetch<{ items: LeadRow[] }>("/api/leads")).items ?? [];
}
export const createLeadRow = (input: LeadInput) => apiFetch<LeadRow>("/api/leads", json("POST", input));
export const patchLeadRow = (id: string, patch: Partial<LeadInput> & { stage?: LeadStage }) =>
  apiFetch<LeadRow>(`/api/leads/${encodeURIComponent(id)}`, json("PATCH", patch));

export async function fetchDealRows() {
  return (await apiFetch<{ items: DealRow[] }>("/api/opportunities")).items ?? [];
}
export const createDealRow = (input: DealInput) => apiFetch<DealRow>("/api/opportunities", json("POST", input));
export const patchDealRow = (id: string, patch: Partial<Omit<DealInput, "customerId">> & { stage?: DealStage }) =>
  apiFetch<DealRow>(`/api/opportunities/${encodeURIComponent(id)}`, json("PATCH", patch));
