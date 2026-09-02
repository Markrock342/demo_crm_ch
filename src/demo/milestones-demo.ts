import type { MilestoneDto } from "../api/operations.ts";
import type { JobRow } from "../api/commercial.ts";

const DEFAULT_MILESTONES = [
  { code: "BOOKING", label: "Booking confirmed", sortOrder: 0, daysFromNow: -7 },
  { code: "SI", label: "SI submitted", sortOrder: 1, daysFromNow: -2 },
  { code: "GATE_IN", label: "Gate-in", sortOrder: 2, daysFromNow: 1 },
  { code: "LOADED", label: "Loaded on vessel", sortOrder: 3, daysFromNow: 3 },
  { code: "SAILED", label: "Vessel sailed", sortOrder: 4, daysFromNow: 5 },
  { code: "CLEAR", label: "Customs cleared", sortOrder: 5, daysFromNow: 12 },
] as const;

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function demoMilestonesForJob(jobId: string): MilestoneDto[] {
  const now = new Date();
  return DEFAULT_MILESTONES.map((m) => ({
    id: `ms-${jobId}-${m.code}`,
    jobId,
    code: m.code,
    label: m.label,
    sortOrder: m.sortOrder,
    plannedAt: addDays(now, m.daysFromNow).toISOString(),
    actualAt: m.daysFromNow < -1 ? addDays(now, m.daysFromNow + 1).toISOString() : null,
  }));
}

export function summarizeDemoMilestones(items: MilestoneDto[]) {
  const now = Date.now();
  const open = items.filter((m) => !m.actualAt).sort((a, b) => a.sortOrder - b.sortOrder);
  const next = open[0] ?? null;
  const atRisk = open.some((m) => m.plannedAt && new Date(m.plannedAt).getTime() < now);
  return {
    nextMilestoneCode: next?.code ?? null,
    nextMilestoneLabel: next?.label ?? null,
    nextMilestonePlannedAt: next?.plannedAt ?? null,
    milestoneAtRisk: atRisk,
    milestonePendingCount: open.length,
  };
}

export function enrichDemoJobs(jobs: JobRow[]): JobRow[] {
  return jobs.map((j) => {
    const ms = demoMilestonesForJob(j.id);
    const summary = summarizeDemoMilestones(ms);
    return { ...j, ...summary };
  });
}

export function filterJobsByMilestoneSummary(jobs: JobRow[], filter: "all" | "at_risk" | "pending"): JobRow[] {
  if (filter === "all") return jobs;
  if (filter === "at_risk") {
    return jobs.filter((j) => j.milestoneAtRisk ?? summarizeDemoMilestones(demoMilestonesForJob(j.id)).milestoneAtRisk);
  }
  return jobs.filter((j) => {
    const pending = j.milestonePendingCount ?? summarizeDemoMilestones(demoMilestonesForJob(j.id)).milestonePendingCount;
    return pending > 0;
  });
}

export function filterDemoJobsByMilestone(jobs: JobRow[], filter: "all" | "at_risk" | "pending"): JobRow[] {
  return filterJobsByMilestoneSummary(jobs, filter);
}

export function formatMilestoneDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

export function milestoneIsOverdue(m: MilestoneDto): boolean {
  if (m.actualAt || !m.plannedAt) return false;
  return new Date(m.plannedAt).getTime() < Date.now();
}
