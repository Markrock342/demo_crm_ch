/* Bookings (carrier space) + job cut-offs — /api/bookings, /api/jobs/:id/cutoffs. */
import { ApiError, type ApiIssue } from "./crm.ts";

async function apiFetch<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
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

export type BookingStage = "booking" | "gate_in" | "sail" | "arrived" | "delivered";
export const BOOKING_STAGES: BookingStage[] = ["booking", "gate_in", "sail", "arrived", "delivered"];

export type Cutoffs = { siCutoff: string | null; cyCutoff: string | null; vgmCutoff: string | null };

export type BookingDto = Cutoffs & {
  id: string;
  bookingNumber: string;
  carrierBookingNo: string | null;
  customerId: string;
  quotationId: string | null;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  carrier: string | null;
  containerType: string | null;
  quantity: number;
  commodity: string | null;
  vessel: string | null;
  voyage: string | null;
  bl: string | null;
  etd: string | null;
  eta: string | null;
  teu: number;
  stage: BookingStage;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED" | string;
  jobs: { id: string; jobNumber: string; status: string }[];
  containers: { id: string; containerNo: string; type: string; status: string }[];
  createdAt: string;
  updatedAt: string;
};

export type BookingInput = Partial<Cutoffs> & {
  customerId: string;
  pol: string;
  pod: string;
  carrierBookingNo?: string | null;
  carrier?: string | null;
  vessel?: string | null;
  voyage?: string | null;
  bl?: string | null;
  etd?: string | null;
  eta?: string | null;
  teu?: number;
  containerType?: string | null;
  quantity?: number;
  commodity?: string | null;
  stage?: BookingStage;
  jobIds?: string[];
};

export type BookingPatch = Partial<Omit<BookingInput, "customerId" | "jobIds">> & { status?: string };

export async function fetchBookings(params?: { jobId?: string; customerId?: string }) {
  const q = new URLSearchParams();
  if (params?.jobId) q.set("jobId", params.jobId);
  if (params?.customerId) q.set("customerId", params.customerId);
  const qs = q.toString();
  const data = await apiFetch<{ items: BookingDto[] }>(`/api/bookings${qs ? `?${qs}` : ""}`);
  return data.items ?? [];
}

export const createBooking = (input: BookingInput) => apiFetch<BookingDto>("/api/bookings", json("POST", input));

export const patchBooking = (id: string, patch: BookingPatch) =>
  apiFetch<BookingDto>(`/api/bookings/${encodeURIComponent(id)}`, json("PATCH", patch));

export const linkBookingJob = (id: string, jobId: string) =>
  apiFetch<BookingDto>(`/api/bookings/${encodeURIComponent(id)}/jobs`, json("POST", { jobId }));

export const unlinkBookingJob = (id: string, jobId: string) =>
  apiFetch<BookingDto>(`/api/bookings/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });

export const patchJobCutoffs = (jobId: string, patch: Partial<Cutoffs>) =>
  apiFetch<Cutoffs & { id: string }>(`/api/jobs/${encodeURIComponent(jobId)}/cutoffs`, json("PATCH", patch));
