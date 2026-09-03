import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ShellJob, ShellJobCharge, ShellJobMilestone } from "../ports/job.port.ts";
import type { ShellQuotation } from "../ports/quote.port.ts";
import { loadPersisted, savePersisted } from "./persist.ts";

const STORAGE_KEY = "cangzhan-shell-jobs-v1";
const VERSION = 1;

const DEFAULT_MILESTONES: ShellJobMilestone[] = [
  { code: "BOOKING", label: "Booking confirmed", actualAt: null },
  { code: "GATE_IN", label: "Gate in", actualAt: null },
  { code: "SAILED", label: "Vessel sailed", actualAt: null },
  { code: "ARRIVED", label: "Arrived POD", actualAt: null },
  { code: "DELIVERED", label: "Delivered", actualAt: null },
];

type ShellJobValue = {
  jobs: ShellJob[];
  createFromQuote: (quote: ShellQuotation) => string | null;
  toggleMilestone: (jobId: string, code: string, complete: boolean) => void;
  attachShipment: (jobId: string, shipmentId: string) => void;
  getById: (id: string) => ShellJob | undefined;
};

const JobCtx = createContext<ShellJobValue | null>(null);

let seq = 1;

export function ShellJobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<ShellJob[]>(() => loadPersisted<ShellJob[]>(STORAGE_KEY, VERSION) ?? []);

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, jobs);
  }, [jobs]);

  const getById = useCallback((id: string) => jobs.find((j) => j.id === id), [jobs]);

  const createFromQuote = useCallback((quote: ShellQuotation) => {
    if (quote.status !== "ACCEPTED") return "errorSave";
    if (jobs.some((j) => j.quotationId === quote.id)) return "errorSave";
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
      milestones: DEFAULT_MILESTONES.map((m) => ({ ...m })),
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setJobs((list) => [row, ...list]);
    return null;
  }, [jobs]);

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

  const value = useMemo(
    () => ({ jobs, createFromQuote, toggleMilestone, attachShipment, getById }),
    [jobs, createFromQuote, toggleMilestone, attachShipment, getById],
  );

  return <JobCtx.Provider value={value}>{children}</JobCtx.Provider>;
}

export function useShellJobs() {
  const ctx = useContext(JobCtx);
  if (!ctx) throw new Error("useShellJobs");
  return ctx;
}
