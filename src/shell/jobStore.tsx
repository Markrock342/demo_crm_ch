import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ShellBillingStatus, ShellJob, ShellJobCharge, ShellJobCost, ShellJobNote } from "../ports/job.port.ts";
import { DEFAULT_MILESTONES } from "../ports/job.port.ts";
import type { ShellQuotation } from "../ports/quote.port.ts";
import { loadPersisted, savePersisted } from "./persist.ts";
import { LCS_JOBS } from "./seedLcs.ts";

const STORAGE_KEY = "cangzhan-shell-jobs-v4";
const VERSION = 4;

export { DEFAULT_MILESTONES };
type ShellJobValue = {
  jobs: ShellJob[];
  createFromQuote: (quote: ShellQuotation) => string | null;
  /** Returns new job id on success, or error key */
  createFromQuoteId: (quote: ShellQuotation) => { id?: string; error?: string };
  toggleMilestone: (jobId: string, code: string, complete: boolean) => void;
  attachShipment: (jobId: string, shipmentId: string) => void;
  getById: (id: string) => ShellJob | undefined;
  addCost: (jobId: string, input: { description: string; vendor: string; vendorId?: string; amount: number; currency?: string }) => void;
  addNote: (jobId: string, body: string, author?: string) => void;
  setBillingStatus: (jobId: string, status: ShellBillingStatus) => void;
  patchJob: (jobId: string, patch: Partial<Pick<ShellJob, "opsOwner" | "salesOwner" | "etd" | "eta" | "carrier" | "vessel" | "voyage" | "delayed">>) => void;
};

const JobCtx = createContext<ShellJobValue | null>(null);

let seq = 100;

export function ShellJobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ShellJob[]>(() => loadPersisted<ShellJob[]>(STORAGE_KEY, VERSION) ?? LCS_JOBS);

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, jobs);
  }, [jobs]);

  const getById = useCallback((id: string) => jobs.find((j) => j.id === id), [jobs]);

  const createFromQuoteId = useCallback((quote: ShellQuotation) => {
    if (quote.status !== "ACCEPTED") return { error: "errorSave" };
    const existing = jobs.find((j) => j.quotationId === quote.id);
    if (existing) return { id: existing.id };
    const id = `sj${Date.now()}`;
    const n = seq++;
    const charges: ShellJobCharge[] = quote.charges.map((c) => ({
      description: c.description,
      amount: c.sellAmount,
      currency: c.currency,
    }));
    const row: ShellJob = {
      id,
      jobNumber: `JOB-SHELL-${String(n).padStart(4, "0")}`,
      customerId: quote.customerId,
      quotationId: quote.id,
      origin: quote.origin,
      destination: quote.destination,
      pol: quote.pol,
      pod: quote.pod,
      containerType: quote.containerType,
      quantity: quote.quantity,
      currency: quote.currency,
      status: "OPEN",
      charges,
      totalSell: quote.totalSell,
      costs: [],
      notes: [],
      milestones: DEFAULT_MILESTONES.map((m) => ({ ...m })),
      createdAt: new Date().toISOString().slice(0, 10),
      shipper: "—",
      consignee: "—",
      incoterm: "FOB",
      carrier: "TBN",
      vessel: "TBN",
      voyage: "TBN",
      etd: "—",
      eta: "—",
      salesOwner: "shell",
      opsOwner: "shell",
      serviceType: "FCL",
      billingStatus: "UNBILLED",
      delayed: false,
    };
    setJobs((list) => [row, ...list]);
    return { id };
  }, [jobs]);

  const createFromQuote = useCallback(
    (quote: ShellQuotation) => {
      const r = createFromQuoteId(quote);
      return r.error ?? null;
    },
    [createFromQuoteId],
  );

  const toggleMilestone = useCallback((jobId: string, code: string, complete: boolean) => {
    setJobs((list) =>
      list.map((j) => {
        if (j.id !== jobId) return j;
        const milestones = j.milestones.map((m) =>
          m.code === code ? { ...m, actualAt: complete ? new Date().toISOString() : null } : m,
        );
        const done = milestones.filter((m) => m.actualAt).length;
        const status = done === 0 ? "OPEN" : done === milestones.length ? "CLOSED" : "IN_PROGRESS";
        return { ...j, milestones, status };
      }),
    );
  }, []);

  const attachShipment = useCallback((jobId: string, shipmentId: string) => {
    setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, shipmentId } : j)));
  }, []);

  const addCost = useCallback((jobId: string, input: { description: string; vendor: string; vendorId?: string; amount: number; currency?: string }) => {
    if (!input.description.trim()) return;
    const cost: ShellJobCost = {
      id: `jc${Date.now()}`,
      description: input.description.trim(),
      vendor: input.vendor.trim() || "—",
      vendorId: input.vendorId,
      amount: Number(input.amount) || 0,
      currency: input.currency || "USD",
    };
    setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, costs: [cost, ...j.costs] } : j)));
  }, []);

  const addNote = useCallback((jobId: string, body: string, author = "shell") => {
    if (!body.trim()) return;
    const note: ShellJobNote = {
      id: `jn${Date.now()}`,
      body: body.trim(),
      author,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, notes: [note, ...j.notes] } : j)));
  }, []);

  const setBillingStatus = useCallback((jobId: string, status: ShellBillingStatus) => {
    setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, billingStatus: status } : j)));
  }, []);

  const patchJob = useCallback(
    (jobId: string, patch: Partial<Pick<ShellJob, "opsOwner" | "salesOwner" | "etd" | "eta" | "carrier" | "vessel" | "voyage" | "delayed">>) => {
      setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
    },
    [],
  );

  const value = useMemo(
    () => ({
      jobs,
      createFromQuote,
      createFromQuoteId,
      toggleMilestone,
      attachShipment,
      getById,
      addCost,
      addNote,
      setBillingStatus,
      patchJob,
    }),
    [jobs, createFromQuote, createFromQuoteId, toggleMilestone, attachShipment, getById, addCost, addNote, setBillingStatus, patchJob],
  );

  return <JobCtx.Provider value={value}>{children}</JobCtx.Provider>;
}

export function useShellJobs() {
  const ctx = useContext(JobCtx);
  if (!ctx) throw new Error("useShellJobs");
  return ctx;
}
