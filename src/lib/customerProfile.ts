/**
 * Customer record vocabulary + validation shared by the API (server/) and the form (src/).
 * Keep this file dependency-free so both the Node server and Vite can import it.
 */

export const BUSINESS_TYPES = ["importer", "exporter", "manufacturer", "trading", "forwarder", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const CUSTOMER_STATUSES = ["active", "on_hold", "inactive"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const LEAD_SOURCES = ["referral", "website", "exhibition", "cold_call", "social", "existing", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const CURRENCIES = ["THB", "USD", "CNY"] as const;
export type CustomerCurrency = (typeof CURRENCIES)[number];

export const PAYMENT_METHODS = ["transfer", "cheque", "cash", "tt", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CONTAINER_TYPES = ["20GP", "40GP", "40HC", "45HC", "20RF", "40RF", "20OT", "40OT", "20FR", "40FR", "LCL"] as const;

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;

export const COUNTRIES = ["TH", "CN", "HK", "VN", "MY", "SG", "ID", "KH", "LA", "MM", "JP", "KR", "US", "OTHER"] as const;

export const CREDIT_TERMS = [0, 7, 15, 30, 45, 60, 90] as const;

/** Thai tax ID (เลขประจำตัวผู้เสียภาษี): 13 digits, last digit is a mod-11 check digit. */
export function isValidThaiTaxId(raw: string | null | undefined): boolean {
  const d = (raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** Strip spaces/dashes from a tax ID. */
export function normalizeTaxId(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\s-]/g, "").trim();
}

/** Thai branch numbers are 5 digits ("00001"); "" / "00000" = head office. */
export function normalizeBranchNo(raw: string | null | undefined): string | null {
  const s = (raw ?? "").replace(/\D/g, "");
  if (!s || /^0+$/.test(s)) return null;
  return s.padStart(5, "0").slice(-5);
}

export function isValidEmail(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim();
  return !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** UN/LOCODE-ish port code ("CNSHA"). */
export function isPortCode(raw: string | null | undefined): boolean {
  return /^[A-Z]{2}[A-Z0-9]{3}$/.test((raw ?? "").trim().toUpperCase());
}
