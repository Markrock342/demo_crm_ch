async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...init });
  const data: unknown = await res.json().catch(() => ({}));
  const body = data as Record<string, unknown>;
  if (!res.ok) throw new Error(String(body.error ?? `api_${res.status}`));
  return body;
}

export type RateSearchRow = {
  laneId: string;
  vendor: string;
  carrier: string | null;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  containerType: string | null;
  validFrom: string;
  validUntil: string;
  currency: string;
  totalBuy: string | null;
  totalSell: string | null;
  margin: string | null;
  marginPct: string | null;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";
};

export async function searchRates(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  const data = await apiFetch(`/api/rates/search?${q}`);
  return (data.items as RateSearchRow[]) ?? [];
}

export type QuotationRow = {
  id: string;
  quotationNumber: string;
  customerId: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  containerType: string | null;
  quantity: number;
  currency: string;
  status: string;
  currentRevision: number;
  validUntil: string | null;
};

export async function fetchQuotations(customerId?: string) {
  const q = customerId ? `?customerId=${customerId}` : "";
  const data = await apiFetch(`/api/quotations${q}`);
  return (data.items as QuotationRow[]) ?? [];
}

export async function fetchQuotation(id: string) {
  return apiFetch(`/api/quotations/${id}`);
}

export async function createQuotationFromRate(input: {
  customerId: string;
  rateLaneId: string;
  quantity: number;
  markupPct?: string;
}) {
  return apiFetch("/api/quotations/from-rate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function submitQuotationApproval(id: string) {
  return apiFetch(`/api/quotations/${id}/submit-approval`, { method: "POST" });
}

export async function approveQuotation(id: string, decision: "APPROVED" | "REJECTED", comment?: string) {
  return apiFetch(`/api/quotations/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, comment }),
  });
}

export async function sendQuotation(id: string) {
  return apiFetch(`/api/quotations/${id}/send`, { method: "POST" });
}

export async function createBookingFromQuote(id: string) {
  return apiFetch(`/api/quotations/${id}/booking`, { method: "POST" });
}

export async function createJobFromBooking(bookingId: string) {
  return apiFetch(`/api/bookings/${bookingId}/job`, { method: "POST" });
}

export async function signPublicQuotation(
  token: string,
  input: {
    signerName: string;
    signerEmail: string;
    signatureMethod: "TYPED" | "DRAWN";
    acceptedTerms: boolean;
    decision: "ACCEPTED" | "REJECTED";
  },
) {
  return apiFetch(`/api/public/quotes/${token}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function quotationPdfUrl(id: string) {
  return `/api/quotations/${id}/pdf`;
}

export async function fetchBookingsForQuote(quotationId: string) {
  const data = await apiFetch(`/api/quotations/${quotationId}/bookings`);
  return (data.items as Array<{ id: string; bookingNumber: string }>) ?? [];
}

export type JobRow = {
  id: string;
  jobNumber: string;
  customerId: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  status: string;
  teu: number;
  currency: string;
  carrier?: string | null;
  vessel?: string | null;
  voyage?: string | null;
  etd?: string | null;
  eta?: string | null;
  containerType?: string | null;
  containerCount?: number | null;
  incoterm?: string | null;
  assignedOperator?: string | null;
  salesOwnerId?: string | null;
  nextMilestoneCode?: string | null;
  nextMilestoneLabel?: string | null;
  nextMilestonePlannedAt?: string | null;
  milestoneAtRisk?: boolean;
  milestonePendingCount?: number;
  grossProfit?: string | null;
  billingStatus?: string | null;
};

export async function fetchJobs(customerId?: string, milestoneFilter?: "all" | "at_risk" | "pending") {
  const q = new URLSearchParams();
  if (customerId) q.set("customerId", customerId);
  if (milestoneFilter && milestoneFilter !== "all") q.set("milestoneFilter", milestoneFilter);
  const qs = q.toString();
  const data = await apiFetch(`/api/jobs${qs ? `?${qs}` : ""}`);
  return (data.items as JobRow[]) ?? [];
}

export async function fetchJob(id: string) {
  return apiFetch(`/api/jobs/${id}`) as Promise<JobRow & Record<string, unknown>>;
}

export type JobFinancials = {
  revenue: Array<{ id: string; description: string; totalAmount: string; currency: string }>;
  cost: Array<{ id: string; description: string; totalAmount: string; currency: string }>;
  totalRevenue: string;
  totalCost: string | null;
  grossProfit: string | null;
  marginPct: string | null;
};

export async function fetchJobFinancials(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}/financials`) as Promise<JobFinancials>;
}

export async function fetchJobCharges(jobId: string) {
  const data = await apiFetch(`/api/jobs/${jobId}/charges`);
  return (
    (data.items as Array<{
      id: string;
      chargeType: string;
      description: string;
      totalAmount: string;
      invoiced: boolean;
      billed?: boolean;
      vendorId?: string | null;
      currency: string;
    }>) ?? []
  );
}

export type VendorBillRow = {
  id: string;
  vendorId: string;
  jobId: string | null;
  billNumber: string;
  total: string;
  currency: string;
  status: string;
  billDate: string;
  dueDate: string;
};

export async function fetchVendorBills(opts?: { vendorId?: string; jobId?: string }) {
  const q = new URLSearchParams();
  if (opts?.vendorId) q.set("vendorId", opts.vendorId);
  if (opts?.jobId) q.set("jobId", opts.jobId);
  const suffix = q.toString() ? `?${q}` : "";
  const data = await apiFetch(`/api/vendor-bills${suffix}`);
  return (data.items as VendorBillRow[]) ?? [];
}

export async function createVendorBillFromJob(input: {
  jobId: string;
  vendorId: string;
  chargeIds: string[];
  paymentTermsDays?: number;
}) {
  return apiFetch("/api/vendor-bills/from-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function approveVendorBill(id: string) {
  return apiFetch(`/api/vendor-bills/${id}/approve`, { method: "POST" });
}

export async function fetchVendors() {
  const data = await apiFetch("/api/vendors");
  return (data.items as Array<{ id: string; company: string; vendorType: string }>) ?? [];
}

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId: string | null;
  total: string;
  balanceDue: string;
  paidAmount: string;
  currency: string;
  status: string;
  dueDate: string;
};

export async function fetchInvoices(customerId?: string) {
  const q = customerId ? `?customerId=${customerId}` : "";
  const data = await apiFetch(`/api/invoices${q}`);
  return (data.items as InvoiceRow[]) ?? [];
}

export async function createInvoiceFromJob(input: { jobId: string; customerId: string; chargeIds: string[] }) {
  return apiFetch("/api/invoices/from-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function issueInvoice(id: string) {
  return apiFetch(`/api/invoices/${id}/issue`, { method: "POST" });
}

export async function recordPayment(input: {
  customerId: string;
  amount: string;
  currency: string;
  method: string;
  reference?: string;
  allocations: Array<{ invoiceId: string; amount: string }>;
}) {
  return apiFetch("/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function fetchArSummary() {
  return apiFetch("/api/finance/ar-summary");
}

export async function createBillingNote(input: { customerId: string; invoiceIds: string[] }) {
  return apiFetch("/api/billing-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function billingNotePdfUrl(id: string) {
  return `/api/billing-notes/${id}/pdf`;
}

export async function fetchBillingNotes(customerId?: string) {
  const q = customerId ? `?customerId=${customerId}` : "";
  const data = await apiFetch(`/api/billing-notes${q}`);
  return (data.items as Array<{ id: string; billingNumber: string; grandTotal: string; currency: string; status: string }>) ?? [];
}

export async function fetchPublicQuote(token: string) {
  const res = await fetch(`/api/public/quotes/${token}`);
  const data = await res.json();
  if (!res.ok) throw new Error(String(data.error ?? "not_found"));
  return data;
}

export async function signPublicQuote(
  token: string,
  input: {
    signerName: string;
    signerEmail: string;
    signerCompany?: string;
    signatureMethod: "TYPED" | "DRAWN";
    acceptedTerms: boolean;
    decision: "ACCEPTED" | "REJECTED";
  },
) {
  const res = await fetch(`/api/public/quotes/${token}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(String(data.error ?? "sign_failed"));
  return data;
}
