import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useShellBilling } from "./billingStore.tsx";
import { useShellJobs } from "./jobStore.tsx";
import { useShellOps } from "./opsStore.tsx";
import { loadPersisted, savePersisted } from "./persist.ts";
import { useShellSupport } from "./supportStore.tsx";

const STORAGE_KEY = "cangzhan-shell-notifications-v4";
const VERSION = 4;

export type ShellNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
  sourceId?: string;
};

type ShellNotificationValue = {
  notifications: ShellNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  refreshFromShell: () => void;
};

const Ctx = createContext<ShellNotificationValue | null>(null);

function buildFromShell(input: {
  delayed: { id: string; jobNumber: string }[];
  noOps: { id: string; jobNumber: string }[];
  docs: { id: string; docType: string; name: string; jobId?: string; status: string }[];
  overdue: { id: string; invoiceNumber: string; jobId?: string }[];
  boxes: { id: string; flags: string; jobId?: string }[];
}): ShellNotification[] {
  const today = new Date().toISOString().slice(0, 10);
  const rows: ShellNotification[] = [];
  for (const j of input.delayed) {
    rows.push({
      id: `n-delay-${j.id}`,
      kind: "delayed",
      title: j.jobNumber,
      body: "ETA delayed",
      href: `/jobs/${j.id}`,
      createdAt: today,
      read: false,
      sourceId: j.id,
    });
  }
  for (const j of input.noOps) {
    rows.push({
      id: `n-ops-${j.id}`,
      kind: "ops",
      title: j.jobNumber,
      body: "No ops owner",
      href: `/jobs/${j.id}`,
      createdAt: today,
      read: false,
      sourceId: j.id,
    });
  }
  for (const d of input.docs.slice(0, 20)) {
    rows.push({
      id: `n-doc-${d.id}`,
      kind: "doc",
      title: `${d.docType} · ${d.name}`,
      body: d.status,
      href: d.jobId ? `/jobs/${d.jobId}` : "/docs?missing=1",
      createdAt: today,
      read: false,
      sourceId: d.id,
    });
  }
  for (const inv of input.overdue) {
    rows.push({
      id: `n-inv-${inv.id}`,
      kind: "ar",
      title: inv.invoiceNumber,
      body: "Overdue / outstanding",
      href: inv.jobId ? `/jobs/${inv.jobId}` : "/invoices",
      createdAt: today,
      read: false,
      sourceId: inv.id,
    });
  }
  for (const b of input.boxes.slice(0, 15)) {
    rows.push({
      id: `n-box-${b.id}`,
      kind: "box",
      title: b.id,
      body: b.flags,
      href: b.jobId ? `/jobs/${b.jobId}` : "/boxes",
      createdAt: today,
      read: false,
      sourceId: b.id,
    });
  }
  return rows;
}

export function ShellNotificationProvider({ children }: { children: ReactNode }) {
  const jobs = useShellJobs();
  const ops = useShellOps();
  const billing = useShellBilling();
  const support = useShellSupport();
  const [notifications, setNotifications] = useState<ShellNotification[]>(
    () => loadPersisted<ShellNotification[]>(STORAGE_KEY, VERSION) ?? [],
  );
  const [hydrated, setHydrated] = useState(false);

  const refreshFromShell = useCallback(() => {
    const delayed = jobs.jobs.filter((j) => j.delayed).map((j) => ({ id: j.id, jobNumber: j.jobNumber }));
    const noOps = jobs.jobs
      .filter((j) => j.status !== "CLOSED" && !j.opsOwner.trim())
      .map((j) => ({ id: j.id, jobNumber: j.jobNumber }));
    const docs = support.docs
      .filter((d) => d.status === "wait" || d.status === "late")
      .map((d) => ({ id: d.id, docType: d.docType, name: d.name, jobId: d.jobId, status: d.status }));
    const overdue = billing.invoices
      .filter((i) => i.overdue || (i.balanceDue > 0 && i.status !== "PAID" && i.status !== "DRAFT"))
      .map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, jobId: i.jobId }));
    const boxes = ops.boxes
      .filter((b) => b.demurrageRisk === "risk" || b.etaChanged || b.coPending || b.missingDoc || b.notReturned)
      .map((b) => {
        const ship = ops.shipments.find((s) => s.id === b.shipmentId);
        const flags = [
          b.demurrageRisk === "risk" ? "demurrage" : "",
          b.etaChanged ? "ETA" : "",
          b.coPending ? "C/O" : "",
          b.missingDoc ? "doc" : "",
          b.notReturned ? "not returned" : "",
        ]
          .filter(Boolean)
          .join(", ");
        return { id: b.id, flags, jobId: ship?.jobId };
      });
    const generated = buildFromShell({ delayed, noOps, docs, overdue, boxes });
    setNotifications((prev) => {
      const readMap = new Map(prev.map((n) => [n.id, n.read]));
      return generated.map((n) => ({ ...n, read: readMap.get(n.id) ?? false }));
    });
  }, [billing.invoices, jobs.jobs, ops.boxes, ops.shipments, support.docs]);

  useEffect(() => {
    if (!hydrated) {
      refreshFromShell();
      setHydrated(true);
    }
  }, [hydrated, refreshFromShell]);

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, notifications);
  }, [notifications]);

  const markRead = useCallback((id: string) => {
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, markRead, markAllRead, refreshFromShell }),
    [notifications, unreadCount, markRead, markAllRead, refreshFromShell],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShellNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShellNotifications");
  return ctx;
}
