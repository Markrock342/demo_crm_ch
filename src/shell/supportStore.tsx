import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadPersisted, savePersisted } from "./persist.ts";
import { LCS_DOCS, LCS_RATES, LCS_TASKS, LCS_VENDORS, LCS_VENDOR_BILLS } from "./seedLcs.ts";

const STORAGE_KEY = "cangzhan-shell-support-v4";
const VERSION = 4;

export type ShellDocType = "BOOKING" | "BL" | "CI" | "PL" | "CO" | "DO" | "POD" | "OTHER";

export type ShellVendorType = "shipping_line" | "trucking" | "customs" | "depot" | "warehouse" | "other";

export type ShellVendor = {
  id: string;
  name: string;
  vendorType: ShellVendorType;
  creditTerm?: string;
};

export type ShellRate = {
  id: string;
  origin: string;
  destination: string;
  containerType: string;
  mode: "FCL";
  buyAmount: number;
  sellAmount: number;
  carrier: string;
  currency: string;
  validFrom: string;
  validUntil: string;
  localCharges?: number;
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
  vendorId: string;
  vendorName: string;
  jobId?: string;
  amount: number;
  currency: string;
  status: "DRAFT" | "APPROVED" | "PAID" | "PARTIAL";
  createdAt: string;
};

type Snapshot = {
  vendors: ShellVendor[];
  rates: ShellRate[];
  tasks: ShellTask[];
  docs: ShellDocItem[];
  vendorBills: ShellVendorBill[];
};

function seed(): Snapshot {
  return {
    vendors: LCS_VENDORS,
    rates: LCS_RATES,
    tasks: LCS_TASKS,
    docs: LCS_DOCS,
    vendorBills: LCS_VENDOR_BILLS,
  };
}

type SupportValue = {
  vendors: ShellVendor[];
  rates: ShellRate[];
  tasks: ShellTask[];
  docs: ShellDocItem[];
  vendorBills: ShellVendorBill[];
  addVendor: (input: { name: string; vendorType: ShellVendorType; creditTerm?: string }) => void;
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
  addVendorBill: (input: { vendorId: string; amount: number; currency: string; jobId?: string }) => void;
  approveVendorBill: (id: string) => void;
  payVendorBill: (id: string, partial?: boolean) => void;
};

const SupportCtx = createContext<SupportValue | null>(null);

export function ShellSupportProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Snapshot>(() => loadPersisted<Snapshot>(STORAGE_KEY, VERSION) ?? seed());

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, state);
  }, [state]);

  const addVendor = useCallback((input: { name: string; vendorType: ShellVendorType; creditTerm?: string }) => {
    if (!input.name.trim()) return;
    setState((s) => ({
      ...s,
      vendors: [
        {
          id: `sv${Date.now()}`,
          name: input.name.trim(),
          vendorType: input.vendorType,
          creditTerm: input.creditTerm,
        },
        ...s.vendors,
      ],
    }));
  }, []);

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

  const addVendorBill = useCallback((input: { vendorId: string; amount: number; currency: string; jobId?: string }) => {
    setState((s) => {
      const v = s.vendors.find((x) => x.id === input.vendorId);
      if (!v) return s;
      return {
        ...s,
        vendorBills: [
          {
            id: `svb${Date.now()}`,
            billNumber: `VB-SHELL-${String(s.vendorBills.length + 1).padStart(3, "0")}`,
            vendorId: v.id,
            vendorName: v.name,
            jobId: input.jobId,
            amount: input.amount,
            currency: input.currency || "USD",
            status: "DRAFT",
            createdAt: new Date().toISOString().slice(0, 10),
          },
          ...s.vendorBills,
        ],
      };
    });
  }, []);

  const approveVendorBill = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      vendorBills: s.vendorBills.map((b) => (b.id === id ? { ...b, status: "APPROVED" } : b)),
    }));
  }, []);

  const payVendorBill = useCallback((id: string, partial?: boolean) => {
    setState((s) => ({
      ...s,
      vendorBills: s.vendorBills.map((b) =>
        b.id === id && (b.status === "APPROVED" || b.status === "PARTIAL")
          ? { ...b, status: partial ? "PARTIAL" : "PAID" }
          : b,
      ),
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      addVendor,
      addRate,
      addTask,
      toggleTask,
      setDocStatus,
      patchDoc,
      addDoc,
      addVendorBill,
      approveVendorBill,
      payVendorBill,
    }),
    [state, addVendor, addRate, addTask, toggleTask, setDocStatus, patchDoc, addDoc, addVendorBill, approveVendorBill, payVendorBill],
  );

  return <SupportCtx.Provider value={value}>{children}</SupportCtx.Provider>;
}

export function useShellSupport() {
  const ctx = useContext(SupportCtx);
  if (!ctx) throw new Error("useShellSupport");
  return ctx;
}
