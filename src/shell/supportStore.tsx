import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadPersisted, savePersisted } from "./persist.ts";
import { LCS_DOCS, LCS_RATES, LCS_TASKS } from "./seedLcs.ts";

const STORAGE_KEY = "cangzhan-shell-support-v3";
const VERSION = 3;

export type ShellDocType = "BOOKING" | "BL" | "CI" | "PL" | "CO" | "DO" | "POD" | "OTHER";

export type ShellRate = {
  id: string;
  origin: string;
  destination: string;
  containerType: string;
  mode: "FCL";
  sellAmount: number;
  currency: string;
  validUntil: string;
};

export type ShellTask = {
  id: string;
  title: string;
  customerId?: string;
  jobId?: string;
  done: boolean;
  priority: "high" | "normal";
};

export type ShellDocApproval = "none" | "pending" | "approved";

export type ShellDocItem = {
  id: string;
  name: string;
  docType: ShellDocType;
  jobId?: string;
  boxId?: string;
  shipmentId?: string;
  status: "ok" | "wait" | "late";
  note?: string;
  approval?: ShellDocApproval;
};

export type ShellVendorBill = {
  id: string;
  billNumber: string;
  vendorName: string;
  amount: number;
  currency: string;
  status: "DRAFT" | "APPROVED";
  createdAt: string;
};

type Snapshot = {
  rates: ShellRate[];
  tasks: ShellTask[];
  docs: ShellDocItem[];
  vendorBills: ShellVendorBill[];
};

function seed(): Snapshot {
  return {
    rates: LCS_RATES,
    tasks: LCS_TASKS,
    docs: LCS_DOCS,
    vendorBills: [],
  };
}

type SupportValue = {
  rates: ShellRate[];
  tasks: ShellTask[];
  docs: ShellDocItem[];
  vendorBills: ShellVendorBill[];
  addRate: (input: Omit<ShellRate, "id" | "mode">) => void;
  addTask: (input: { title: string; customerId?: string; jobId?: string; priority?: "high" | "normal" }) => void;
  toggleTask: (id: string) => void;
  setDocStatus: (id: string, status: ShellDocItem["status"]) => void;
  patchDoc: (id: string, patch: Partial<Pick<ShellDocItem, "status" | "note" | "approval">>) => void;
  addDoc: (input: {
    name: string;
    docType?: ShellDocType;
    jobId?: string;
    boxId?: string;
    shipmentId?: string;
    note?: string;
  }) => void;
  addVendorBill: (input: { vendorName: string; amount: number; currency: string }) => void;
  approveVendorBill: (id: string) => void;
};

const SupportCtx = createContext<SupportValue | null>(null);

export function ShellSupportProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Snapshot>(() => loadPersisted<Snapshot>(STORAGE_KEY, VERSION) ?? seed());

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, state);
  }, [state]);

  const addRate = useCallback((input: Omit<ShellRate, "id" | "mode">) => {
    setState((s) => ({
      ...s,
      rates: [{ id: `sr${Date.now()}`, mode: "FCL", ...input }, ...s.rates],
    }));
  }, []);

  const addTask = useCallback((input: { title: string; customerId?: string; jobId?: string; priority?: "high" | "normal" }) => {
    if (!input.title.trim()) return;
    setState((s) => ({
      ...s,
      tasks: [
        {
          id: `st${Date.now()}`,
          title: input.title.trim(),
          customerId: input.customerId,
          jobId: input.jobId,
          done: false,
          priority: input.priority ?? "normal",
        },
        ...s.tasks,
      ],
    }));
  }, []);

  const toggleTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  }, []);

  const setDocStatus = useCallback((id: string, status: ShellDocItem["status"]) => {
    setState((s) => ({
      ...s,
      docs: s.docs.map((d) => (d.id === id ? { ...d, status } : d)),
    }));
  }, []);

  const patchDoc = useCallback((id: string, patch: Partial<Pick<ShellDocItem, "status" | "note" | "approval">>) => {
    setState((s) => ({
      ...s,
      docs: s.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  }, []);

  const addDoc = useCallback(
    (input: {
      name: string;
      docType?: ShellDocType;
      jobId?: string;
      boxId?: string;
      shipmentId?: string;
      note?: string;
    }) => {
      if (!input.name.trim()) return;
      setState((s) => ({
        ...s,
        docs: [
          {
            id: `sd${Date.now()}`,
            name: input.name.trim(),
            docType: input.docType ?? "OTHER",
            jobId: input.jobId,
            boxId: input.boxId,
            shipmentId: input.shipmentId,
            status: "wait",
            note: input.note ?? "",
            approval: "none",
          },
          ...s.docs,
        ],
      }));
    },
    [],
  );

  const addVendorBill = useCallback((input: { vendorName: string; amount: number; currency: string }) => {
    if (!input.vendorName.trim()) return;
    setState((s) => ({
      ...s,
      vendorBills: [
        {
          id: `svb${Date.now()}`,
          billNumber: `VB-SHELL-${String(s.vendorBills.length + 1).padStart(3, "0")}`,
          vendorName: input.vendorName.trim(),
          amount: input.amount,
          currency: input.currency || "USD",
          status: "DRAFT",
          createdAt: new Date().toISOString().slice(0, 10),
        },
        ...s.vendorBills,
      ],
    }));
  }, []);

  const approveVendorBill = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      vendorBills: s.vendorBills.map((b) => (b.id === id ? { ...b, status: "APPROVED" } : b)),
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      addRate,
      addTask,
      toggleTask,
      setDocStatus,
      patchDoc,
      addDoc,
      addVendorBill,
      approveVendorBill,
    }),
    [state, addRate, addTask, toggleTask, setDocStatus, patchDoc, addDoc, addVendorBill, approveVendorBill],
  );

  return <SupportCtx.Provider value={value}>{children}</SupportCtx.Provider>;
}

export function useShellSupport() {
  const ctx = useContext(SupportCtx);
  if (!ctx) throw new Error("useShellSupport");
  return ctx;
}
