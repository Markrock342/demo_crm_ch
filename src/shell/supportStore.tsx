import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadPersisted, savePersisted } from "./persist.ts";

const STORAGE_KEY = "cangzhan-shell-support-v1";
const VERSION = 1;

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

export type ShellDocItem = {
  id: string;
  name: string;
  boxId?: string;
  shipmentId?: string;
  status: "ok" | "wait" | "late";
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
    rates: [
      {
        id: "sr1",
        origin: "Shanghai",
        destination: "Laem Chabang",
        containerType: "40HC",
        mode: "FCL",
        sellAmount: 1250,
        currency: "USD",
        validUntil: "2026-10-31",
      },
      {
        id: "sr2",
        origin: "Ningbo",
        destination: "Laem Chabang",
        containerType: "20GP",
        mode: "FCL",
        sellAmount: 780,
        currency: "USD",
        validUntil: "2026-10-15",
      },
    ],
    tasks: [
      { id: "st1", title: "Confirm B/L draft Yuetai", customerId: "sc-seed-1", done: false, priority: "high" },
      { id: "st2", title: "Yard slot check B2/B3", done: false, priority: "normal" },
    ],
    docs: [
      { id: "sd1", name: "B/L", boxId: "TCLU1234567", shipmentId: "ssh1", status: "wait" },
      { id: "sd2", name: "Packing list", boxId: "TCLU1234567", shipmentId: "ssh1", status: "ok" },
      { id: "sd3", name: "Customs", boxId: "MSCU7654321", shipmentId: "ssh1", status: "late" },
    ],
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
  addDoc: (input: { name: string; boxId?: string; shipmentId?: string }) => void;
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

  const addDoc = useCallback((input: { name: string; boxId?: string; shipmentId?: string }) => {
    if (!input.name.trim()) return;
    setState((s) => ({
      ...s,
      docs: [{ id: `sd${Date.now()}`, name: input.name.trim(), boxId: input.boxId, shipmentId: input.shipmentId, status: "wait" }, ...s.docs],
    }));
  }, []);

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
      addDoc,
      addVendorBill,
      approveVendorBill,
    }),
    [state, addRate, addTask, toggleTask, setDocStatus, addDoc, addVendorBill, approveVendorBill],
  );

  return <SupportCtx.Provider value={value}>{children}</SupportCtx.Provider>;
}

export function useShellSupport() {
  const ctx = useContext(SupportCtx);
  if (!ctx) throw new Error("useShellSupport");
  return ctx;
}
