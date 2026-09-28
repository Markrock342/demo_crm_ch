/** Rate management (add / edit / expire) — POST /api/rates, GET|PATCH /api/rates/lanes/:id. */
export type RateChargeInput = {
  chargeCode: string;
  description?: string;
  side: "BUY" | "SELL";
  unit: string;
  quantity?: string;
  unitPrice: string;
  currency: string;
};

export type RateInput = {
  vendorId: string;
  carrier?: string;
  validFrom: string;
  validUntil: string;
  currency: string;
  lane: { pol: string; pod: string; origin?: string; destination?: string; containerType?: string };
  charges: RateChargeInput[];
};

export type RateLaneDetail = {
  lane: { id: string; pol: string; pod: string; origin: string; destination: string; containerType: string | null };
  sheet: { id: string; vendorId: string; carrier: string | null; validFrom: string; validUntil: string; currency: string };
  charges: { chargeCode: string; description: string; side: "BUY" | "SELL"; unit: string; quantity: string; unitPrice: string | null; currency: string }[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(String(data.error ?? `api_${res.status}`));
  return data as T;
}

export const createRate = (input: RateInput) => call<{ laneId: string; sheetId: string }>("/api/rates", { method: "POST", body: JSON.stringify(input) });

export const fetchRateLane = (laneId: string) => call<RateLaneDetail>(`/api/rates/lanes/${encodeURIComponent(laneId)}`);

export const updateRateLane = (laneId: string, patch: Partial<Omit<RateInput, "lane">> & { containerType?: string | null; expire?: true }) =>
  call<{ laneId: string }>(`/api/rates/lanes/${encodeURIComponent(laneId)}`, { method: "PATCH", body: JSON.stringify(patch) });
