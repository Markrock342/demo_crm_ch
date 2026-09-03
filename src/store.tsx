import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  boxes as seedBoxes,
  customers as seedCustomers,
  mailsSeed,
  type Box,
  type BoxStatus,
  type Customer,
  type Mail,
} from "./data";
import {
  activities as seedActs,
  contacts as seedContacts,
  deals as seedDeals,
  docs as seedDocs,
  leads as seedLeads,
  tasks as seedTasks,
  type Activity,
  type Contact,
  type Deal,
  type DealStage,
  type Lead,
  type LeadStage,
  type TaskItem,
  type CrmDoc,
} from "./crm";
import type { MailAnalysis } from "./ai/client";
import { invoices as seedInvoices, shipments as seedShipments, type Invoice, type Shipment } from "./logistics";
import { applyMailOps, syncCustomerBoxCounts } from "./ops";
import { t, type Locale } from "./i18n";
import type { DocStatus } from "./crm";
import {
  apiCreateContact,
  apiCreateCustomer,
  apiCreateLead,
  apiCreateOpportunity,
  apiUpdateLeadStage,
  apiUpdateOpportunityStage,
  type CrmBundle,
} from "./api/crm";
import { apiCreateMail, apiPatchDocStatus, apiPatchMail, apiUpsertDoc } from "./api/comms";

const UI_KEY = "cangzhan-ui-v1";

type UiPrefs = {
  locale: Locale;
  compact: boolean;
  motion: boolean;
};

function loadUi(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UiPrefs>;
      return {
        locale: p.locale ?? "zh",
        compact: p.compact ?? true,
        motion: p.motion ?? true,
      };
    }
  } catch {
    /* ignore */
  }
  return { locale: "zh", compact: true, motion: true };
}

type Persist = {
  locale: Locale;
  customers: Customer[];
  boxes: Box[];
  mails: Mail[];
  contacts: Contact[];
  leads: Lead[];
  deals: Deal[];
  tasks: TaskItem[];
  activities: Activity[];
  docs: CrmDoc[];
  shipments: Shipment[];
  invoices: Invoice[];
  compact: boolean;
  motion: boolean;
};

function emptyPersist(): Persist {
  const boxes = seedBoxes;
  return {
    locale: "zh",
    customers: syncCustomerBoxCounts(seedCustomers, boxes),
    boxes,
    mails: mailsSeed,
    contacts: seedContacts,
    leads: seedLeads,
    deals: seedDeals,
    tasks: seedTasks,
    activities: seedActs,
    docs: seedDocs,
    shipments: seedShipments,
    invoices: seedInvoices,
    compact: false,
    motion: true,
  };
}

type Store = Persist & {
  toast: string | null;
  query: string;
  setQuery: (q: string) => void;
  setLocale: (l: Locale) => void;
  tx: (key: string, vars?: Record<string, string | number>) => string;
  addCustomer: (c: Pick<Customer, "nameZh" | "cityZh" | "laneZh" | "owner">) => string | null;
  addBox: (b: Pick<Box, "id" | "customerId" | "type" | "dir" | "status" | "yardZh" | "eta" | "bl" | "teu">) => string | null;
  setBoxStatus: (id: string, status: BoxStatus) => void;
  moveBox: (id: string, yard: string) => void;
  sendMail: (id: string) => void;
  saveDraft: (id: string, body: string) => void;
  rejectMail: (id: string) => void;
  markRead: (id: string) => void;
  applyMailAnalysis: (id: string, a: MailAnalysis) => void;
  applyMailOps: (id: string) => void;
  setDocStatus: (id: string, status: DocStatus) => void;
  addPastedMail: (input: { from: string; subject: string; body: string; analysis?: MailAnalysis }) => string;
  addNote: (customerId: string, body: string) => void;
  moveDeal: (id: string, stage: DealStage) => void;
  setLeadStage: (id: string, stage: LeadStage) => void;
  convertLead: (id: string) => void;
  toggleTask: (id: string) => void;
  addTask: (title: string, customerId?: string) => void;
  addLead: (l: Pick<Lead, "company" | "city" | "lane" | "contact" | "source" | "teu" | "owner">) => void;
  addContact: (c: Pick<Contact, "customerId" | "name" | "title" | "email" | "phone" | "wechat">) => void;
  addDeal: (d: Pick<Deal, "customerId" | "title" | "lane" | "value" | "teu" | "close" | "owner">) => void;
  setCompact: (v: boolean) => void;
  setMotion: (v: boolean) => void;
  reset: () => void;
  flash: (key: string) => void;
  hydrateCrm: (bundle: CrmBundle) => void;
  hydrateComms: (bundle: { mails: Mail[]; docs: CrmDoc[] }) => void;
  apiEnabled: boolean;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const init = useMemo(() => {
    const ui = loadUi();
    return { ...emptyPersist(), ...ui };
  }, []);
  const [locale, setLocaleState] = useState<Locale>(init.locale);
  const [customers, setCustomers] = useState(init.customers);
  const [boxes, setBoxes] = useState(init.boxes);
  const [mails, setMails] = useState(init.mails);
  const [contacts, setContacts] = useState(init.contacts);
  const [leads, setLeads] = useState(init.leads);
  const [deals, setDeals] = useState(init.deals);
  const [tasks, setTasks] = useState(init.tasks);
  const [activities, setActivities] = useState(init.activities);
  const [docs, setDocs] = useState(init.docs);
  const [shipments, setShipments] = useState(init.shipments);
  const [invoices, setInvoices] = useState(init.invoices);
  const [compact, setCompact] = useState(init.compact);
  const [motion, setMotionState] = useState(init.motion);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [apiEnabled, setApiEnabled] = useState(false);

  useEffect(() => {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({
        locale,
        compact,
        motion,
      }),
    );
  }, [locale, compact, motion]);

  const tx = useCallback((key: string, vars?: Record<string, string | number>) => t(locale, key, vars), [locale]);

  const flash = useCallback(
    (key: string) => {
      setToast(t(locale, key));
      window.setTimeout(() => setToast(null), 2200);
    },
    [locale],
  );

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);
  const setMotion = useCallback((v: boolean) => setMotionState(v), []);

  const hydrateCrm = useCallback((bundle: CrmBundle) => {
    setCustomers(bundle.customers);
    setContacts(bundle.contacts);
    setLeads(bundle.leads);
    setDeals(bundle.deals);
    setApiEnabled(true);
  }, []);

  const hydrateComms = useCallback((bundle: { mails: Mail[]; docs: CrmDoc[] }) => {
    setMails(bundle.mails);
    setDocs(bundle.docs);
  }, []);

  const addCustomer = useCallback(
    (c: Pick<Customer, "nameZh" | "cityZh" | "laneZh" | "owner">) => {
      if (!c.nameZh.trim()) return "errorName";
      if (apiEnabled) {
        void apiCreateCustomer({
          nameZh: c.nameZh.trim(),
          cityZh: c.cityZh.trim() || "—",
          laneZh: c.laneZh.trim() || "—",
          owner: c.owner.trim() || "林晓衡",
        })
          .then((row) => setCustomers((list) => [row, ...list]))
          .catch(() => flash("errorSave"));
        flash("savedCustomer");
        return null;
      }
      const today = new Date();
      const stamp = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setCustomers((list) => [
        {
          id: `c${Date.now()}`,
          nameZh: c.nameZh.trim(),
          nameTh: c.nameZh.trim(),
          nameEn: c.nameZh.trim(),
          cityZh: c.cityZh.trim() || "—",
          cityTh: c.cityZh.trim() || "—",
          cityEn: c.cityZh.trim() || "—",
          laneZh: c.laneZh.trim() || "—",
          laneTh: c.laneZh.trim() || "—",
          laneEn: c.laneZh.trim() || "—",
          boxes: 0,
          owner: c.owner.trim() || "林晓衡",
          updated: stamp,
          arDays: 0,
        },
        ...list,
      ]);
      flash("savedCustomer");
      return null;
    },
    [apiEnabled, flash],
  );

  const addBox = useCallback(
    (b: Pick<Box, "id" | "customerId" | "type" | "dir" | "status" | "yardZh" | "eta" | "bl" | "teu">) => {
      if (!b.id.trim()) return "errorBox";
      const id = b.id.trim().toUpperCase();
      if (boxes.some((x) => x.id === id)) return "errorBox";
      setBoxes((list) => {
        const next = [
          {
            ...b,
            id,
            yardTh: b.yardZh,
            yardEn: b.yardZh,
            teu: b.teu || 2,
          },
          ...list,
        ];
        setCustomers((cs) => syncCustomerBoxCounts(cs, next));
        return next;
      });
      flash("savedBox");
      return null;
    },
    [boxes, flash],
  );

  const setBoxStatus = useCallback(
    (id: string, status: BoxStatus) => {
      setBoxes((list) => {
        const next = list.map((b) => (b.id === id ? { ...b, status } : b));
        setCustomers((cs) => syncCustomerBoxCounts(cs, next));
        return next;
      });
      flash("statusChanged");
    },
    [flash],
  );

  const moveBox = useCallback(
    (id: string, yard: string) => {
      setBoxes((list) =>
        list.map((b) => (b.id === id ? { ...b, yardZh: yard, yardTh: yard, yardEn: yard } : b)),
      );
      flash("movedYard");
    },
    [flash],
  );

  const setDocStatus = useCallback(
    (id: string, status: DocStatus) => {
      const stamp = `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
      if (apiEnabled) {
        void apiPatchDocStatus(id, status)
          .then((row) => setDocs((list) => list.map((d) => (d.id === id ? { ...d, ...row } : d))))
          .catch(() => flash("errorSave"));
      } else {
        setDocs((list) => list.map((d) => (d.id === id ? { ...d, status, updated: stamp } : d)));
      }
      flash("docUpdated");
    },
    [apiEnabled, flash],
  );

  const sendMail = useCallback(
    (id: string) => {
      if (apiEnabled) {
        void apiPatchMail(id, { state: "sent", unread: false })
          .then((row) => setMails((list) => list.map((m) => (m.id === id ? { ...m, ...row } : m))))
          .catch(() => flash("errorSave"));
      } else {
        setMails((list) => list.map((m) => (m.id === id ? { ...m, state: "sent", unread: false } : m)));
      }
      flash("sentMail");
    },
    [apiEnabled, flash],
  );

  const saveDraft = useCallback(
    (id: string, body: string) => {
      const patch =
        locale === "th" ? { draftTh: body } : locale === "en" ? { draftEn: body } : { draftZh: body };
      if (apiEnabled) {
        void apiPatchMail(id, patch)
          .then((row) => setMails((list) => list.map((m) => (m.id === id ? { ...m, ...row } : m))))
          .catch(() => flash("errorSave"));
      } else {
        setMails((list) =>
          list.map((m) => {
            if (m.id !== id) return m;
            if (locale === "th") return { ...m, draftTh: body };
            if (locale === "en") return { ...m, draftEn: body };
            return { ...m, draftZh: body };
          }),
        );
      }
      flash("draftSaved");
    },
    [apiEnabled, flash, locale],
  );

  const rejectMail = useCallback(
    (id: string) => {
      if (apiEnabled) {
        void apiPatchMail(id, { state: "rejected", unread: false })
          .then((row) => setMails((list) => list.map((m) => (m.id === id ? { ...m, ...row } : m))))
          .catch(() => flash("errorSave"));
      } else {
        setMails((list) => list.map((m) => (m.id === id ? { ...m, state: "rejected", unread: false } : m)));
      }
      flash("rejectedMail");
    },
    [apiEnabled, flash],
  );

  const markRead = useCallback(
    (id: string) => {
      if (apiEnabled) {
        void apiPatchMail(id, { unread: false })
          .then((row) => setMails((list) => list.map((m) => (m.id === id ? { ...m, ...row } : m))))
          .catch(() => undefined);
      } else {
        setMails((list) => list.map((m) => (m.id === id ? { ...m, unread: false } : m)));
      }
    },
    [apiEnabled],
  );

  const applyMailAnalysis = useCallback(
    (id: string, a: MailAnalysis) => {
      const patch: Partial<Mail> = {
        draftZh: a.draftZh,
        draftTh: a.draftTh,
        draftEn: a.draftEn,
        confidence: a.confidence,
        intent: a.intent,
        summary: a.summary,
        origin: a.origin,
        dest: a.dest,
        extractedBoxes: a.boxIds,
        docsMissing: a.docsMissing,
        suggestedStatus: a.suggestedStatus,
        needsHuman: a.needsHuman,
        customerId: a.customerId || undefined,
      };
      if (apiEnabled) {
        void apiPatchMail(id, patch)
          .then((row) => setMails((list) => list.map((m) => (m.id === id ? { ...m, ...row } : m))))
          .catch(() => flash("errorSave"));
      } else {
        setMails((list) =>
          list.map((m) =>
            m.id === id
              ? {
                  ...m,
                  ...patch,
                  customerId: a.customerId || m.customerId,
                }
              : m,
          ),
        );
      }
      flash("draftSaved");
    },
    [apiEnabled, flash],
  );

  const applyMailOpsFn = useCallback(
    (id: string) => {
      const mail = mails.find((m) => m.id === id);
      if (!mail) return;
      const a: MailAnalysis = {
        intent: mail.intent ?? "",
        summary: mail.summary ?? "",
        origin: mail.origin ?? "",
        dest: mail.dest ?? "",
        boxIds: mail.extractedBoxes ?? [],
        blNumbers: [],
        docsMissing: mail.docsMissing ?? [],
        suggestedStatus: mail.suggestedStatus ?? "",
        confidence: mail.confidence,
        needsHuman: mail.needsHuman ?? false,
        draftZh: mail.draftZh,
        draftTh: mail.draftTh,
        draftEn: mail.draftEn,
        customerId: mail.customerId || null,
      };
      const result = applyMailOps(a, boxes, docs, tasks, mail.customerId);
      setBoxes(result.boxes);
      setDocs(result.docs);
      setTasks(result.tasks);
      setCustomers((cs) => syncCustomerBoxCounts(cs, result.boxes));
      if (apiEnabled) {
        for (const d of result.docs) {
          void apiUpsertDoc(d).catch(() => undefined);
        }
      }
      if (result.applied.length) {
        setActivities((list) => [
          {
            id: `a${Date.now()}`,
            type: "task",
            at: `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")} ${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`,
            user: "林晓衡",
            customerId: mail.customerId,
            body: `Applied mail ops: ${result.applied.join(", ")}`,
          },
          ...list,
        ]);
      }
      flash("opsApplied");
    },
    [apiEnabled, boxes, docs, flash, mails, tasks],
  );

  const addPastedMail = useCallback(
    (input: { from: string; subject: string; body: string; analysis?: MailAnalysis }) => {
      const id = `m${Date.now()}`;
      const a = input.analysis;
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const customerId = a?.customerId || "";
      const row: Mail = {
        id,
        customerId,
        from: input.from.trim() || "paste",
        subjectZh: input.subject.trim() || input.body.slice(0, 40),
        subjectTh: input.subject.trim() || input.body.slice(0, 40),
        subjectEn: input.subject.trim() || input.body.slice(0, 40),
        bodyZh: input.body,
        bodyTh: input.body,
        bodyEn: input.body,
        draftZh: a?.draftZh ?? "",
        draftTh: a?.draftTh ?? "",
        draftEn: a?.draftEn ?? "",
        time,
        confidence: a?.confidence ?? 0,
        unread: false,
        state: "open",
        intent: a?.intent,
        summary: a?.summary,
        origin: a?.origin,
        dest: a?.dest,
        extractedBoxes: a?.boxIds,
        docsMissing: a?.docsMissing,
        suggestedStatus: a?.suggestedStatus,
        needsHuman: a?.needsHuman ?? true,
      };
      setMails((list) => [row, ...list]);
      if (apiEnabled) {
        void apiCreateMail(row).catch(() => flash("errorSave"));
      }
      return id;
    },
    [apiEnabled, flash],
  );

  const addNote = useCallback(
    (customerId: string, body: string) => {
      if (!body.trim()) return;
      const now = new Date();
      const at = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      setActivities((list) => [{ id: `a${Date.now()}`, type: "note", at, user: "林晓衡", customerId, body: body.trim() }, ...list]);
      flash("noteSaved");
    },
    [flash],
  );

  const moveDeal = useCallback(
    (id: string, stage: DealStage) => {
      if (apiEnabled) {
        void apiUpdateOpportunityStage(id, stage)
          .then((row) => setDeals((list) => list.map((d) => (d.id === id ? { ...d, stage: row.stage as DealStage } : d))))
          .catch(() => flash("errorSave"));
      } else {
        setDeals((list) => list.map((d) => (d.id === id ? { ...d, stage } : d)));
      }
      flash("dealMoved");
    },
    [apiEnabled, flash],
  );

  const setLeadStage = useCallback(
    (id: string, stage: LeadStage) => {
      if (apiEnabled) {
        void apiUpdateLeadStage(id, stage)
          .then((row) => setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage: row.stage as LeadStage } : l))))
          .catch(() => flash("errorSave"));
      } else {
        setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage } : l)));
      }
    },
    [apiEnabled, flash],
  );

  const convertLead = useCallback(
    (id: string) => {
      const lead = leads.find((l) => l.id === id);
      if (!lead) return;
      addCustomer({ nameZh: lead.company, cityZh: lead.city, laneZh: lead.lane, owner: lead.owner });
      setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage: "qualified" } : l)));
      flash("converted");
    },
    [addCustomer, flash, leads],
  );

  const toggleTask = useCallback(
    (id: string) => {
      setTasks((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
      flash("taskDone");
    },
    [flash],
  );

  const addTask = useCallback(
    (title: string, customerId?: string) => {
      if (!title.trim()) return;
      setTasks((list) => [
        {
          id: `t${Date.now()}`,
          title: title.trim(),
          due: "09-03",
          owner: "林晓衡",
          priority: "mid",
          done: false,
          customerId,
        },
        ...list,
      ]);
      flash("taskDone");
    },
    [flash],
  );

  const addLead = useCallback(
    (l: Pick<Lead, "company" | "city" | "lane" | "contact" | "source" | "teu" | "owner">) => {
      if (!l.company.trim()) return;
      if (apiEnabled) {
        void apiCreateLead({
          company: l.company.trim(),
          city: l.city.trim() || "—",
          lane: l.lane.trim() || "—",
          contact: l.contact.trim() || "—",
          source: l.source.trim() || "—",
          teu: l.teu || 0,
          owner: l.owner.trim() || "林晓衡",
        })
          .then((row) => setLeads((list) => [row as Lead, ...list]))
          .catch(() => flash("errorSave"));
        flash("savedLead");
        return;
      }
      setLeads((list) => [
        {
          id: `l${Date.now()}`,
          company: l.company.trim(),
          city: l.city.trim() || "—",
          lane: l.lane.trim() || "—",
          contact: l.contact.trim() || "—",
          source: l.source.trim() || "—",
          stage: "new",
          teu: l.teu || 0,
          owner: l.owner.trim() || "林晓衡",
          updated: "09-02",
        },
        ...list,
      ]);
      flash("savedLead");
    },
    [apiEnabled, flash],
  );

  const addContact = useCallback(
    (c: Pick<Contact, "customerId" | "name" | "title" | "email" | "phone" | "wechat">) => {
      if (!c.name.trim()) return;
      if (apiEnabled) {
        void apiCreateContact({
          customerId: c.customerId,
          name: c.name.trim(),
          title: c.title.trim(),
          email: c.email.trim(),
          phone: c.phone.trim(),
          wechat: c.wechat.trim(),
          primary: contacts.every((x) => x.customerId !== c.customerId),
        })
          .then((row) => setContacts((list) => [row as Contact, ...list]))
          .catch(() => flash("errorSave"));
        flash("savedPerson");
        return;
      }
      setContacts((list) => [
        {
          id: `p${Date.now()}`,
          customerId: c.customerId,
          name: c.name.trim(),
          title: c.title.trim(),
          email: c.email.trim(),
          phone: c.phone.trim(),
          wechat: c.wechat.trim(),
          primary: list.every((x) => x.customerId !== c.customerId),
        },
        ...list,
      ]);
      flash("savedPerson");
    },
    [apiEnabled, contacts, flash],
  );

  const addDeal = useCallback(
    (d: Pick<Deal, "customerId" | "title" | "lane" | "value" | "teu" | "close" | "owner">) => {
      if (!d.title.trim()) return;
      if (apiEnabled) {
        void apiCreateOpportunity({
          customerId: d.customerId,
          title: d.title.trim(),
          lane: d.lane.trim() || "—",
          value: d.value || 0,
          teu: d.teu || 0,
          close: d.close.trim() || "09-30",
          owner: d.owner.trim() || "林晓衡",
        })
          .then((row) => setDeals((list) => [row as Deal, ...list]))
          .catch(() => flash("errorSave"));
        flash("savedDeal");
        return;
      }
      setDeals((list) => [
        {
          id: `d${Date.now()}`,
          customerId: d.customerId,
          title: d.title.trim(),
          lane: d.lane.trim() || "—",
          stage: "qualify",
          value: d.value || 0,
          teu: d.teu || 0,
          close: d.close.trim() || "09-30",
          owner: d.owner.trim() || "林晓衡",
        },
        ...list,
      ]);
      flash("savedDeal");
    },
    [apiEnabled, flash],
  );

  const reset = useCallback(() => {
    if (apiEnabled) return;
    if (!window.confirm(t(locale, "confirmReset"))) return;
    const fresh = emptyPersist();
    setCustomers(fresh.customers);
    setBoxes(fresh.boxes);
    setMails(fresh.mails);
    setContacts(fresh.contacts);
    setLeads(fresh.leads);
    setDeals(fresh.deals);
    setTasks(fresh.tasks);
    setActivities(fresh.activities);
    setDocs(fresh.docs);
    setShipments(fresh.shipments);
    setInvoices(fresh.invoices);
    flash("resetDemo");
  }, [apiEnabled, flash, locale]);

  const value: Store = {
    locale,
    customers,
    boxes,
    mails,
    contacts,
    leads,
    deals,
    tasks,
    activities,
    docs,
    shipments,
    invoices,
    compact,
    motion,
    toast,
    query,
    setQuery,
    setLocale,
    tx,
    addCustomer,
    addBox,
    setBoxStatus,
    moveBox,
    sendMail,
    saveDraft,
    rejectMail,
    markRead,
    applyMailAnalysis,
    applyMailOps: applyMailOpsFn,
    setDocStatus,
    addPastedMail,
    addNote,
    moveDeal,
    setLeadStage,
    convertLead,
    toggleTask,
    addTask,
    addLead,
    addContact,
    addDeal,
    setCompact,
    setMotion,
    reset,
    flash,
    hydrateCrm,
    hydrateComms,
    apiEnabled,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore");
  return s;
}
