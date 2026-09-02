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
import { t, type Locale } from "./i18n";

const KEY = "cangzhan-demo-v3";

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
  compact: boolean;
  motion: boolean;
};

function emptyPersist(): Persist {
  return {
    locale: "zh",
    customers: seedCustomers,
    boxes: seedBoxes,
    mails: mailsSeed,
    contacts: seedContacts,
    leads: seedLeads,
    deals: seedDeals,
    tasks: seedTasks,
    activities: seedActs,
    docs: seedDocs,
    compact: false,
    motion: true,
  };
}

function load(): Persist {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persist>;
      const base = emptyPersist();
      return {
        locale: p.locale ?? base.locale,
        customers: p.customers ?? base.customers,
        boxes: p.boxes ?? base.boxes,
        mails: p.mails ?? base.mails,
        contacts: p.contacts ?? base.contacts,
        leads: p.leads ?? base.leads,
        deals: p.deals ?? base.deals,
        tasks: p.tasks ?? base.tasks,
        activities: p.activities ?? base.activities,
        docs: p.docs ?? base.docs,
        compact: p.compact ?? base.compact,
        motion: p.motion ?? base.motion,
      };
    }
  } catch {
    /* ponytail: demo persist, ignore bad JSON */
  }
  return emptyPersist();
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
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const init = useMemo(load, []);
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
  const [compact, setCompact] = useState(init.compact);
  const [motion, setMotionState] = useState(init.motion);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
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
        compact,
        motion,
      }),
    );
  }, [locale, customers, boxes, mails, contacts, leads, deals, tasks, activities, docs, compact, motion]);

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

  const addCustomer = useCallback(
    (c: Pick<Customer, "nameZh" | "cityZh" | "laneZh" | "owner">) => {
      if (!c.nameZh.trim()) return "errorName";
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
    [flash],
  );

  const addBox = useCallback(
    (b: Pick<Box, "id" | "customerId" | "type" | "dir" | "status" | "yardZh" | "eta" | "bl" | "teu">) => {
      if (!b.id.trim()) return "errorBox";
      const id = b.id.trim().toUpperCase();
      if (boxes.some((x) => x.id === id)) return "errorBox";
      setBoxes((list) => {
        return [
          {
            ...b,
            id,
            yardTh: b.yardZh,
            yardEn: b.yardZh,
            teu: b.teu || 2,
          },
          ...list,
        ];
      });
      setCustomers((list) =>
        list.map((c) => (c.id === b.customerId ? { ...c, boxes: c.boxes + 1 } : c)),
      );
      flash("savedBox");
      return null;
    },
    [boxes, flash],
  );

  const setBoxStatus = useCallback(
    (id: string, status: BoxStatus) => {
      setBoxes((list) => list.map((b) => (b.id === id ? { ...b, status } : b)));
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

  const sendMail = useCallback(
    (id: string) => {
      setMails((list) => list.map((m) => (m.id === id ? { ...m, state: "sent", unread: false } : m)));
      flash("sentMail");
    },
    [flash],
  );

  const saveDraft = useCallback(
    (id: string, body: string) => {
      setMails((list) =>
        list.map((m) => {
          if (m.id !== id) return m;
          if (locale === "th") return { ...m, draftTh: body };
          if (locale === "en") return { ...m, draftEn: body };
          return { ...m, draftZh: body };
        }),
      );
      flash("draftSaved");
    },
    [flash, locale],
  );

  const rejectMail = useCallback(
    (id: string) => {
      setMails((list) => list.map((m) => (m.id === id ? { ...m, state: "rejected", unread: false } : m)));
      flash("rejectedMail");
    },
    [flash],
  );

  const markRead = useCallback((id: string) => {
    setMails((list) => list.map((m) => (m.id === id ? { ...m, unread: false } : m)));
  }, []);

  const applyMailAnalysis = useCallback(
    (id: string, a: MailAnalysis) => {
      setMails((list) =>
        list.map((m) =>
          m.id === id
            ? {
                ...m,
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
                needsHuman: a.needsHuman,
                customerId: a.customerId || m.customerId,
              }
            : m,
        ),
      );
      flash("draftSaved");
    },
    [flash],
  );

  const addPastedMail = useCallback(
    (input: { from: string; subject: string; body: string; analysis?: MailAnalysis }) => {
      const id = `m${Date.now()}`;
      const a = input.analysis;
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const customerId = a?.customerId || "";
      setMails((list) => [
        {
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
          needsHuman: a?.needsHuman ?? true,
        },
        ...list,
      ]);
      return id;
    },
    [],
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
      setDeals((list) => list.map((d) => (d.id === id ? { ...d, stage } : d)));
      flash("dealMoved");
    },
    [flash],
  );

  const setLeadStage = useCallback((id: string, stage: LeadStage) => {
    setLeads((list) => list.map((l) => (l.id === id ? { ...l, stage } : l)));
  }, []);

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
    [flash],
  );

  const addContact = useCallback(
    (c: Pick<Contact, "customerId" | "name" | "title" | "email" | "phone" | "wechat">) => {
      if (!c.name.trim()) return;
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
    [flash],
  );

  const addDeal = useCallback(
    (d: Pick<Deal, "customerId" | "title" | "lane" | "value" | "teu" | "close" | "owner">) => {
      if (!d.title.trim()) return;
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
    [flash],
  );

  const reset = useCallback(() => {
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
    flash("resetDemo");
  }, [flash, locale]);

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
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore");
  return s;
}
