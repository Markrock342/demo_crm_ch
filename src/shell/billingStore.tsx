import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ShellBillingNote, ShellInvoice, ShellPayment } from "../ports/billing.port.ts";
import type { ShellJob } from "../ports/job.port.ts";
import { loadPersisted, savePersisted } from "./persist.ts";
import { LCS_INVOICES } from "./seedLcs.ts";

const STORAGE_KEY = "cangzhan-shell-billing-v3";
const VERSION = 3;

type Snapshot = {
  invoices: ShellInvoice[];
  billingNotes: ShellBillingNote[];
  payments: ShellPayment[];
  invSeq: number;
  bnSeq: number;
};

type ShellBillingValue = {
  invoices: ShellInvoice[];
  billingNotes: ShellBillingNote[];
  payments: ShellPayment[];
  createDraftInvoice: (input: { customerId: string; total: number; currency: string; jobId?: string }) => string | null;
  createFromJob: (job: ShellJob) => string | null;
  issueInvoice: (id: string) => void;
  createBillingNote: (invoiceIds: string[]) => string | null;
  recordPayment: (input: { invoiceId: string; amount: number }) => string | null;
};

const BillingCtx = createContext<ShellBillingValue | null>(null);

export function ShellBillingProvider({ children }: { children: ReactNode }) {
  const loaded = loadPersisted<Snapshot>(STORAGE_KEY, VERSION);
  const [invoices, setInvoices] = useState<ShellInvoice[]>(loaded?.invoices ?? LCS_INVOICES);
  const [billingNotes, setBillingNotes] = useState<ShellBillingNote[]>(loaded?.billingNotes ?? []);
  const [payments, setPayments] = useState<ShellPayment[]>(loaded?.payments ?? []);
  const [invSeq, setInvSeq] = useState(loaded?.invSeq ?? 20);
  const [bnSeq, setBnSeq] = useState(loaded?.bnSeq ?? 1);

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, { invoices, billingNotes, payments, invSeq, bnSeq });
  }, [invoices, billingNotes, payments, invSeq, bnSeq]);

  const createDraftInvoice = useCallback(
    (input: { customerId: string; total: number; currency: string; jobId?: string }) => {
      if (!input.customerId.trim()) return "quoteNeedCustomer";
      const total = Number(input.total) || 0;
      const id = `si${Date.now()}`;
      const n = invSeq;
      const createdAt = new Date().toISOString().slice(0, 10);
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const dueDate = due.toISOString().slice(0, 10);
      const vatAmount = Math.round(total * 0.07 * 100) / 100;
      setInvSeq((x) => x + 1);
      setInvoices((list) => [
        {
          id,
          invoiceNumber: `INV-SHELL-${String(n).padStart(4, "0")}`,
          customerId: input.customerId,
          jobId: input.jobId,
          total,
          balanceDue: total,
          currency: input.currency.trim() || "USD",
          status: "DRAFT",
          createdAt,
          dueDate,
          creditTermDays: 30,
          overdue: false,
          vatAmount,
          whtAmount: 0,
        },
        ...list,
      ]);
      return null;
    },
    [invSeq],
  );

  const createFromJob = useCallback(
    (job: ShellJob) => {
      if (invoices.some((i) => i.jobId === job.id)) return "errorSave";
      return createDraftInvoice({
        customerId: job.customerId,
        total: job.totalSell,
        currency: job.currency,
        jobId: job.id,
      });
    },
    [createDraftInvoice, invoices],
  );

  const issueInvoice = useCallback((id: string) => {
    setInvoices((list) =>
      list.map((inv) => (inv.id === id && inv.status === "DRAFT" ? { ...inv, status: "ISSUED" } : inv)),
    );
  }, []);

  const createBillingNote = useCallback(
    (invoiceIds: string[]) => {
      if (!invoiceIds.length) return "errorSave";
      const selected = invoices.filter((i) => invoiceIds.includes(i.id));
      if (!selected.length) return "errorSave";
      const customerId = selected[0]!.customerId;
      if (selected.some((i) => i.customerId !== customerId)) return "errorSave";
      if (selected.some((i) => i.status === "DRAFT")) return "errorSave";
      const currency = selected[0]!.currency;
      const grandTotal = selected.reduce((n, i) => n + i.total, 0);
      const id = `sbn${Date.now()}`;
      const n = bnSeq;
      setBnSeq((x) => x + 1);
      setBillingNotes((list) => [
        {
          id,
          billingNumber: `BN-SHELL-${String(n).padStart(4, "0")}`,
          customerId,
          invoiceIds: [...invoiceIds],
          grandTotal,
          currency,
          createdAt: new Date().toISOString().slice(0, 10),
        },
        ...list,
      ]);
      return null;
    },
    [bnSeq, invoices],
  );

  const recordPayment = useCallback(
    (input: { invoiceId: string; amount: number }) => {
      const amount = Number(input.amount);
      if (!input.invoiceId || !(amount > 0)) return "errorSave";
      const inv = invoices.find((i) => i.id === input.invoiceId);
      if (!inv || inv.status === "DRAFT" || inv.status === "PAID") return "errorSave";
      setInvoices((list) =>
        list.map((row) => {
          if (row.id !== input.invoiceId) return row;
          const nextBalance = Math.max(0, row.balanceDue - amount);
          const status = nextBalance <= 0 ? ("PAID" as const) : ("PARTIALLY_PAID" as const);
          return { ...row, balanceDue: nextBalance, status };
        }),
      );
      setPayments((list) => [
        {
          id: `spay${Date.now()}`,
          invoiceId: input.invoiceId,
          customerId: inv.customerId,
          amount,
          currency: inv.currency,
          method: "BANK_TRANSFER",
          createdAt: new Date().toISOString().slice(0, 10),
        },
        ...list,
      ]);
      return null;
    },
    [invoices],
  );

  const value = useMemo(
    () => ({
      invoices,
      billingNotes,
      payments,
      createDraftInvoice,
      createFromJob,
      issueInvoice,
      createBillingNote,
      recordPayment,
    }),
    [invoices, billingNotes, payments, createDraftInvoice, createFromJob, issueInvoice, createBillingNote, recordPayment],
  );

  return <BillingCtx.Provider value={value}>{children}</BillingCtx.Provider>;
}

export function useShellBilling() {
  const ctx = useContext(BillingCtx);
  if (!ctx) throw new Error("useShellBilling");
  return ctx;
}
