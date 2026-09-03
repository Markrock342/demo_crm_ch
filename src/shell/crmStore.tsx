import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ShellContact, ShellCustomer, ShellDeal, ShellLead } from "../ports/crm.port.ts";
import { loadPersisted, savePersisted } from "./persist.ts";
import { LCS_CONTACTS, LCS_CUSTOMERS } from "./seedLcs.ts";

const STORAGE_KEY = "cangzhan-shell-crm-v3";
const VERSION = 3;

function stamp() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CrmSnapshot = {
  customers: ShellCustomer[];
  contacts: ShellContact[];
  leads: ShellLead[];
  deals: ShellDeal[];
};

function seedCrm(): CrmSnapshot {
  return {
    customers: LCS_CUSTOMERS,
    contacts: LCS_CONTACTS,
    leads: [],
    deals: [],
  };
}

function loadInitial(): CrmSnapshot {
  return loadPersisted<CrmSnapshot>(STORAGE_KEY, VERSION) ?? seedCrm();
}

type ShellCrmValue = {
  customers: ShellCustomer[];
  contacts: ShellContact[];
  leads: ShellLead[];
  deals: ShellDeal[];
  addCustomer: (input: { nameZh: string; cityZh: string; laneZh: string; owner: string }) => string | null;
  addContact: (input: { customerId: string; name: string; title: string; email: string; phone: string; wechat: string }) => void;
  addLead: (input: { company: string; city: string; lane: string; contact: string; source: string; teu: number; owner: string }) => void;
  addDeal: (input: { customerId: string; title: string; lane: string; value: number; teu: number; close: string; owner: string }) => void;
  moveDeal: (id: string, stage: string) => void;
  setLeadStage: (id: string, stage: string) => void;
};

const CrmCtx = createContext<ShellCrmValue | null>(null);

export function ShellCrmProvider({ children }: { children: ReactNode }) {
  const initial = loadInitial();
  const [customers, setCustomers] = useState<ShellCustomer[]>(initial.customers);
  const [contacts, setContacts] = useState<ShellContact[]>(initial.contacts);
  const [leads, setLeads] = useState<ShellLead[]>(initial.leads);
  const [deals, setDeals] = useState<ShellDeal[]>(initial.deals);

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, { customers, contacts, leads, deals });
  }, [customers, contacts, leads, deals]);

  const addCustomer = useCallback((input: { nameZh: string; cityZh: string; laneZh: string; owner: string }) => {
    if (!input.nameZh.trim()) return "errorName";
    const id = `sc${Date.now()}`;
    const name = input.nameZh.trim();
    setCustomers((list) => [
      {
        id,
        nameZh: name,
        nameTh: name,
        nameEn: name,
        cityZh: input.cityZh.trim() || "—",
        cityTh: input.cityZh.trim() || "—",
        cityEn: input.cityZh.trim() || "—",
        laneZh: input.laneZh.trim() || "—",
        laneTh: input.laneZh.trim() || "—",
        laneEn: input.laneZh.trim() || "—",
        owner: input.owner.trim() || "—",
        updated: stamp(),
      },
      ...list,
    ]);
    return null;
  }, []);

  const addContact = useCallback(
    (input: { customerId: string; name: string; title: string; email: string; phone: string; wechat: string }) => {
      if (!input.name.trim() || !input.customerId) return;
      setContacts((list) => [
        {
          id: `sp${Date.now()}`,
          customerId: input.customerId,
          name: input.name.trim(),
          title: input.title.trim(),
          email: input.email.trim(),
          phone: input.phone.trim(),
          wechat: input.wechat.trim(),
          primary: list.filter((c) => c.customerId === input.customerId).length === 0,
        },
        ...list,
      ]);
    },
    [],
  );

  const addLead = useCallback(
    (input: { company: string; city: string; lane: string; contact: string; source: string; teu: number; owner: string }) => {
      if (!input.company.trim()) return;
      setLeads((list) => [
        {
          id: `sl${Date.now()}`,
          company: input.company.trim(),
          city: input.city.trim() || "—",
          lane: input.lane.trim() || "—",
          contact: input.contact.trim() || "—",
          source: input.source.trim() || "shell",
          stage: "new",
          teu: input.teu || 0,
          owner: input.owner.trim() || "—",
          updated: stamp(),
        },
        ...list,
      ]);
    },
    [],
  );

  const addDeal = useCallback(
    (input: { customerId: string; title: string; lane: string; value: number; teu: number; close: string; owner: string }) => {
      if (!input.title.trim() || !input.customerId) return;
      setDeals((list) => [
        {
          id: `sd${Date.now()}`,
          customerId: input.customerId,
          title: input.title.trim(),
          lane: input.lane.trim() || "—",
          stage: "qualify",
          value: input.value || 0,
          teu: input.teu || 0,
          close: input.close.trim() || stamp(),
          owner: input.owner.trim() || "—",
        },
        ...list,
      ]);
    },
    [],
  );

  const moveDeal = useCallback((id: string, stage: string) => {
    setDeals((list) => list.map((d) => (d.id === id ? { ...d, stage } : d)));
  }, []);

  const setLeadStage = useCallback((id: string, stage: string) => {
    setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage, updated: stamp() } : l)));
  }, []);

  const value = useMemo(
    () => ({
      customers,
      contacts,
      leads,
      deals,
      addCustomer,
      addContact,
      addLead,
      addDeal,
      moveDeal,
      setLeadStage,
    }),
    [customers, contacts, leads, deals, addCustomer, addContact, addLead, addDeal, moveDeal, setLeadStage],
  );

  return <CrmCtx.Provider value={value}>{children}</CrmCtx.Provider>;
}

export function useShellCrm() {
  const ctx = useContext(CrmCtx);
  if (!ctx) throw new Error("useShellCrm");
  return ctx;
}
