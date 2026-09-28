import { stageFromNext } from "../jobsShared.ts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { mapJobRowToShell } from "../../../adapters/api/jobMapper.ts";
import type { JobRow } from "../../../api/commercial.ts";
import { fetchInvoicesPage, fetchJobsPage } from "../../../api/lists.ts";
import { isBeforeToday, todayIso } from "../../../lib/dates.ts";
import type { ShellJob } from "../../../ports/job.port.ts";
import { useShellBilling } from "../../../shell/billingStore.tsx";
import { useShellJobs } from "../../../shell/jobStore.tsx";
import { useShellOps } from "../../../shell/opsStore.tsx";
import { useShellSupport } from "../../../shell/supportStore.tsx";
import { useStore } from "../../../store";
import { fmtDate, fmtMoney } from "../../lib/format.ts";
import { useAppMode } from "../../hooks/useAppMode.ts";
import { useCan } from "../../hooks/useCan.ts";
import { queryKeys } from "../../queries/keys.ts";
import { useCustomerLookup } from "../../hooks/useCustomerLookup.ts";
import type { Locale } from "../../../i18n";

export type AttentionKind = "delay" | "owner" | "docs" | "ar" | "container";
export type Severity = "high" | "medium" | "low";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  severity: Severity;
  /** Human identifier: job no., invoice no., container no. */
  ref: string;
  refMono?: boolean;
  customer: string;
  reason: string;
  action: string;
  /** 1–2 word next step for buttons on cards. */
  short: string;
  /** Days the issue has been open / overdue, when known. */
  ageDays: number | null;
  to: string;
};

export const KINDS: AttentionKind[] = ["delay", "owner", "docs", "ar", "container"];
const SEV_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const DAY = 86_400_000;

/** Parse "YYYY-MM-DD…", "MM-DD" or "MM-DD HH:mm" (legacy seed) into a local Date. */
export function parseLooseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === "—") return null;
  const md = /^(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/.exec(s);
  if (md) {
    const y = Number(todayIso().slice(0, 4));
    return new Date(y, Number(md[1]) - 1, Number(md[2]), Number(md[3] ?? 0), Number(md[4] ?? 0));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days from `d` to today (positive = in the past). */
export function daysAgo(d: Date | null): number | null {
  if (!d) return null;
  const t = new Date();
  const a = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((a - b) / DAY);
}

/** A job plus the code of its next open milestone (live list API / shell milestones). */
export type HomeJob = ShellJob & { nextCode?: string | null };

const toHomeJob = (r: JobRow): HomeJob => ({ ...mapJobRowToShell(r), nextCode: r.nextMilestoneCode ?? null });

/** Jobs for the current mode: live = the 500 most recently updated (paged list API). */
export function useModeJobs(): { jobs: HomeJob[]; loading: boolean } {
  const { shell } = useAppMode();
  const jobsShell = useShellJobs();
  const liveJobs = useQuery({
    queryKey: [...queryKeys.jobs.all, "home-with-next"],
    queryFn: async () => (await fetchJobsPage({ limit: 500 })).items.map(toHomeJob),
    enabled: !shell,
  });
  const shellJobs = useMemo(
    () => jobsShell.jobs.map((j): HomeJob => ({ ...j, nextCode: j.milestones.find((m) => !m.actualAt)?.code ?? "DONE" })),
    [jobsShell.jobs],
  );
  return shell ? { jobs: shellJobs, loading: false } : { jobs: liveJobs.data ?? [], loading: liveJobs.isLoading };
}

/**
 * Active (not closed) jobs only — what the home page and the action center work from.
 * Live: open + in-progress tabs of the paged list, so closed history never crowds them out.
 */
export function useActiveJobs(): { jobs: HomeJob[]; loading: boolean } {
  const { shell } = useAppMode();
  const jobsShell = useShellJobs();
  const liveJobs = useQuery({
    queryKey: [...queryKeys.jobs.all, "home-active"],
    queryFn: async () => {
      const [open, going] = await Promise.all([fetchJobsPage({ status: "OPEN", limit: 500 }), fetchJobsPage({ status: "IN_PROGRESS", limit: 500 })]);
      return [...open.items, ...going.items].map(toHomeJob);
    },
    enabled: !shell,
  });
  const shellJobs = useMemo(
    () =>
      jobsShell.jobs
        .filter((j) => j.status !== "CLOSED")
        .map((j): HomeJob => ({ ...j, nextCode: j.milestones.find((m) => !m.actualAt)?.code ?? "DONE" })),
    [jobsShell.jobs],
  );
  return shell ? { jobs: shellJobs, loading: false } : { jobs: liveJobs.data ?? [], loading: liveJobs.isLoading };
}

/* ── Shipment stage (0 booked … 5 delivered) ───────── */


/** Which of the six shipment stages a job is at: milestones first, then ETD/ETA dates. */
/** Same stage rule as the Jobs page (jobsShared) so Overview counts match /jobs?stage=. */
export function jobStage(j: HomeJob, now = Date.now()): number {
  return stageFromNext(j, j.nextCode ?? null, false, now);
}

export type InvoiceLite = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  jobId?: string | null;
  balanceDue: number;
  currency: string;
  status: string;
  dueDate?: string;
  overdue: boolean;
};

export function useModeInvoices(): InvoiceLite[] {
  const { shell } = useAppMode();
  const billing = useShellBilling();
  const { live } = useAppMode();
  const can = useCan();
  // Open receivables only (balance > 0, issued / part-paid) — all that the home page and alerts use.
  const liveInv = useQuery({
    queryKey: ["invoices", "home-open"],
    queryFn: async () => (await fetchInvoicesPage({ view: "open", limit: 500 })).items,
    enabled: live && can("invoice.view"),
  });
  return useMemo(() => {
    if (shell) {
      return billing.invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        customerId: i.customerId,
        jobId: i.jobId,
        balanceDue: i.balanceDue,
        currency: i.currency,
        status: i.status,
        dueDate: i.dueDate,
        overdue:
          Boolean(i.overdue) ||
          (i.balanceDue > 0 && Boolean(i.dueDate) && isBeforeToday(String(i.dueDate)) && i.status !== "PAID" && i.status !== "DRAFT"),
      }));
    }
    return (liveInv.data ?? []).map((i) => {
      const bal = parseFloat(i.balanceDue);
      const due = i.dueDate ? String(i.dueDate).slice(0, 10) : undefined;
      return {
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        customerId: i.customerId,
        jobId: i.jobId,
        balanceDue: bal,
        currency: i.currency,
        status: i.status,
        dueDate: due,
        overdue: bal > 0 && Boolean(due) && isBeforeToday(due!) && i.status !== "PAID" && i.status !== "DRAFT",
      };
    });
  }, [billing.invoices, liveInv.data, shell]);
}

/** Everything that needs a person, as one prioritized list (shell + live). */
export function useAttentionItems(): { items: AttentionItem[]; loading: boolean } {
  const { tx, locale } = useStore();
  const { shell } = useAppMode();
  const { jobs, loading } = useActiveJobs();
  const invoices = useModeInvoices();
  const ops = useShellOps();
  const support = useShellSupport();
  const { nameOf } = useCustomerLookup();
  const loc = locale as Locale;

  const items = useMemo(() => {
    const list: AttentionItem[] = [];
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    for (const j of jobs) {
      if (j.status === "CLOSED") continue;
      const customer = nameOf(j.customerId);
      if (j.delayed) {
        const eta = parseLooseDate(j.eta);
        const late = daysAgo(eta);
        list.push({
          id: `delay-${j.id}`,
          kind: "delay",
          severity: "high",
          ref: j.jobNumber,
          customer,
          reason: tx("home_reason_delay"),
          action: tx("home_action_delay"),
          short: tx("home_next_delay"),
          ageDays: late !== null && late > 0 ? late : null,
          to: `/jobs/${j.id}`,
        });
      }
      if (!j.opsOwner.trim()) {
        const age = daysAgo(parseLooseDate(j.createdAt));
        list.push({
          id: `owner-${j.id}`,
          kind: "owner",
          severity: "medium",
          ref: j.jobNumber,
          customer,
          reason: tx("home_reason_owner"),
          action: tx("home_action_owner"),
          short: tx("home_next_owner"),
          ageDays: age !== null && age >= 0 ? age : null,
          to: `/jobs/${j.id}`,
        });
      }
    }

    for (const inv of invoices) {
      if (!inv.overdue) continue;
      const late = daysAgo(parseLooseDate(inv.dueDate));
      list.push({
        id: `ar-${inv.id}`,
        kind: "ar",
        severity: late !== null && late > 30 ? "high" : "medium",
        ref: inv.invoiceNumber,
        customer: nameOf(inv.customerId),
        reason: tx("home_reason_ar", { amount: fmtMoney(inv.balanceDue, inv.currency, loc) }),
        action: tx("home_action_ar"),
        short: tx("home_next_ar"),
        ageDays: late !== null && late > 0 ? late : null,
        to: inv.jobId ? `/jobs/${inv.jobId}` : "/invoices",
      });
    }

    if (shell) {
      for (const d of support.docs) {
        if (d.status !== "late" && d.status !== "wait") continue;
        const job = d.jobId ? jobById.get(d.jobId) : undefined;
        list.push({
          id: `doc-${d.id}`,
          kind: "docs",
          severity: d.status === "late" ? "high" : "medium",
          ref: job?.jobNumber ?? d.boxId ?? d.docType,
          refMono: !job && Boolean(d.boxId),
          customer: job ? nameOf(job.customerId) : "—",
          reason: tx(d.status === "late" ? "home_reason_doc_late" : "home_reason_doc_wait", { doc: d.name || d.docType }),
          action: tx("home_action_doc"),
          short: tx("home_next_doc"),
          ageDays: null,
          to: d.jobId ? `/jobs/${d.jobId}` : "/docs?missing=1",
        });
      }
      for (const b of ops.boxes) {
        const ship = ops.shipments.find((s) => s.id === b.shipmentId);
        const to = ship?.jobId ? `/jobs/${ship.jobId}` : `/boxes?q=${b.id}`;
        const base = { ref: b.id, refMono: true, customer: nameOf(b.customerId), to, kind: "container" as const };
        if (b.demurrageRisk === "risk" || b.demurrageRisk === "watch") {
          list.push({
            ...base,
            id: `dem-${b.id}`,
            severity: b.demurrageRisk === "risk" ? "high" : "medium",
            reason: tx(b.demurrageRisk === "risk" ? "home_reason_dem_risk" : "home_reason_dem_watch", {
              date: fmtDate(parseLooseDate(b.lastFreeDay), loc),
            }),
            action: tx("home_action_dem"),
            short: tx("home_next_dem"),
            ageDays: null,
          });
        }
        const flags: [boolean | undefined, string, string, string, Severity][] = [
          [b.notReturned, "home_reason_not_returned", "home_action_not_returned", "home_next_return", "high"],
          [b.customsPending, "home_reason_customs", "home_action_customs", "home_next_customs", "medium"],
          [b.coPending, "home_reason_co", "home_action_doc", "home_next_doc", "medium"],
          [b.missingDoc, "home_reason_box_doc", "home_action_doc", "home_next_doc", "medium"],
          [b.etaChanged, "home_reason_eta_changed", "home_action_eta_changed", "home_next_notify", "low"],
        ];
        for (const [on, reason, action, short, severity] of flags) {
          if (!on) continue;
          list.push({ ...base, id: `${reason}-${b.id}`, severity, reason: tx(reason), action: tx(action), short: tx(short), ageDays: null });
        }
      }
    }

    return list.sort(
      (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (b.ageDays ?? -1) - (a.ageDays ?? -1),
    );
  }, [invoices, jobs, loc, nameOf, ops.boxes, ops.shipments, shell, support.docs, tx]);

  return { items, loading };
}

export const SEVERITY_TONE: Record<Severity, "danger" | "warning" | "info"> = {
  high: "danger",
  medium: "warning",
  low: "info",
};
