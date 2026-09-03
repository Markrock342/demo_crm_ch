import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ShellQuotation, ShellQuoteCharge, ShellQuoteStatus } from "../ports/quote.port.ts";

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
  validUntil: string;
  termsAndConditions: string;
};

type ShellQuoteValue = {
  quotations: ShellQuotation[];
  getById: (id: string) => ShellQuotation | undefined;
  createDraft: (input: CreateInput) => string | null;
  setStatus: (id: string, status: ShellQuoteStatus) => void;
};

const QuoteCtx = createContext<ShellQuoteValue | null>(null);

let seq = 1;

export function ShellQuoteProvider({ children }: { children: ReactNode }) {
  const [quotations, setQuotations] = useState<ShellQuotation[]>([]);

  const getById = useCallback((id: string) => quotations.find((q) => q.id === id), [quotations]);

  const createDraft = useCallback((input: CreateInput) => {
    if (!input.customerId.trim()) return "quoteNeedCustomer";
    const totalSell = input.charges.reduce((n, c) => n + (Number(c.sellAmount) || 0), 0);
    const id = `sq${Date.now()}`;
    const n = seq++;
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
      charges: input.charges.length
        ? input.charges
        : [{ description: "Ocean freight", sellAmount: 0, currency: input.currency.trim() || "USD" }],
      totalSell,
      validUntil: input.validUntil.trim() || "—",
      termsAndConditions: input.termsAndConditions.trim() || "",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setQuotations((list) => [row, ...list]);
    return null;
  }, []);

  const setStatus = useCallback((id: string, status: ShellQuoteStatus) => {
    setQuotations((list) => list.map((q) => (q.id === id ? { ...q, status } : q)));
  }, []);

  const value = useMemo(
    () => ({ quotations, getById, createDraft, setStatus }),
    [quotations, getById, createDraft, setStatus],
  );

  return <QuoteCtx.Provider value={value}>{children}</QuoteCtx.Provider>;
}

export function useShellQuotes() {
  const ctx = useContext(QuoteCtx);
  if (!ctx) throw new Error("useShellQuotes");
  return ctx;
}
