import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ShellQuotation, ShellQuoteCharge, ShellQuoteStatus } from "../ports/quote.port.ts";
import { loadPersisted, savePersisted } from "./persist.ts";
import { LCS_QUOTES } from "./seedLcs.ts";

const STORAGE_KEY = "cangzhan-shell-quotes-v4";
const VERSION = 4;

type CreateInput = {
  customerId: string;
  origin: string;
  destination: string;
  pol: string;
  pod: string;
  mode: string;
  containerType: string;
  quantity: number;
  currency: string;
  charges: ShellQuoteCharge[];
  validFrom?: string;
  validUntil: string;
  termsAndConditions: string;
};

function expireStale(list: ShellQuotation[]): ShellQuotation[] {
  const today = new Date().toISOString().slice(0, 10);
  return list.map((q) => {
    if (q.status === "ACCEPTED" || q.status === "REJECTED" || q.status === "EXPIRED") return q;
    if (q.validUntil && q.validUntil !== "—" && q.validUntil < today) {
      return { ...q, status: "EXPIRED" as const };
    }
    return q;
  });
}

type ShellQuoteValue = {
  quotations: ShellQuotation[];
  getById: (id: string) => ShellQuotation | undefined;
  createDraft: (input: CreateInput) => string | null;
  setStatus: (id: string, status: ShellQuoteStatus) => void;
  bumpRevision: (id: string) => void;
};

const QuoteCtx = createContext<ShellQuoteValue | null>(null);

let seq = 1;

export function ShellQuoteProvider({ children }: { children: ReactNode }) {
  const [quotations, setQuotations] = useState<ShellQuotation[]>(() =>
    expireStale(loadPersisted<ShellQuotation[]>(STORAGE_KEY, VERSION) ?? LCS_QUOTES),
  );

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, quotations);
  }, [quotations]);

  const getById = useCallback((id: string) => quotations.find((q) => q.id === id), [quotations]);

  const createDraft = useCallback((input: CreateInput) => {
    if (!input.customerId.trim()) return "quoteNeedCustomer";
    const charges = input.charges.filter((c) => c.description.trim());
    const totalSell = charges.reduce((n, c) => n + (Number(c.sellAmount) || 0), 0);
    const id = `sq${Date.now()}`;
    const n = seq++;
    const today = new Date().toISOString().slice(0, 10);
    const row: ShellQuotation = {
      id,
      quotationNumber: `Q-SHELL-${String(n).padStart(4, "0")}`,
      customerId: input.customerId,
      origin: input.origin.trim() || "—",
      destination: input.destination.trim() || "—",
      pol: input.pol.trim() || "—",
      pod: input.pod.trim() || "—",
      mode: input.mode.trim() || "FCL",
      containerType: input.containerType.trim() || "40HC",
      quantity: input.quantity || 1,
      currency: input.currency.trim() || "USD",
      status: "DRAFT",
      charges: charges.length
        ? charges
        : [{ description: "Ocean freight", sellAmount: 0, currency: input.currency.trim() || "USD" }],
      totalSell,
      validFrom: input.validFrom?.trim() || today,
      validUntil: input.validUntil.trim() || "—",
      revision: 1,
      termsAndConditions: input.termsAndConditions.trim() || "",
      createdAt: today,
    };
    setQuotations((list) => [row, ...list]);
    return null;
  }, []);

  const setStatus = useCallback((id: string, status: ShellQuoteStatus) => {
    setQuotations((list) => list.map((q) => (q.id === id ? { ...q, status } : q)));
  }, []);

  const bumpRevision = useCallback((id: string) => {
    setQuotations((list) =>
      list.map((q) => (q.id === id ? { ...q, revision: (q.revision || 1) + 1, status: "DRAFT" } : q)),
    );
  }, []);

  const value = useMemo(
    () => ({ quotations, getById, createDraft, setStatus, bumpRevision }),
    [quotations, getById, createDraft, setStatus, bumpRevision],
  );

  return <QuoteCtx.Provider value={value}>{children}</QuoteCtx.Provider>;
}

export function useShellQuotes() {
  const ctx = useContext(QuoteCtx);
  if (!ctx) throw new Error("useShellQuotes");
  return ctx;
}
