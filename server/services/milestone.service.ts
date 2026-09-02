import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { jobMilestones } from "../db/schema/operations.js";

export type MilestoneDto = {
  id: string;
  jobId: string;
  code: string;
  label: string;
  plannedAt: string | null;
  actualAt: string | null;
  sortOrder: number;
};

export const DEFAULT_MILESTONES = [
  { code: "BOOKING", label: "Booking confirmed", sortOrder: 0, daysFromNow: -7 },
  { code: "SI", label: "SI submitted", sortOrder: 1, daysFromNow: -2 },
  { code: "GATE_IN", label: "Gate-in", sortOrder: 2, daysFromNow: 1 },
  { code: "LOADED", label: "Loaded on vessel", sortOrder: 3, daysFromNow: 3 },
  { code: "SAILED", label: "Vessel sailed", sortOrder: 4, daysFromNow: 5 },
  { code: "CLEAR", label: "Customs cleared", sortOrder: 5, daysFromNow: 12 },
] as const;

function toDto(row: typeof jobMilestones.$inferSelect): MilestoneDto {
  return {
    id: row.id,
    jobId: row.jobId,
    code: row.code,
    label: row.label,
    plannedAt: row.plannedAt ? row.plannedAt.toISOString() : null,
    actualAt: row.actualAt ? row.actualAt.toISOString() : null,
    sortOrder: row.sortOrder,
  };
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function listJobMilestones(db: Db, jobId: string) {
  const rows = await db
    .select()
    .from(jobMilestones)
    .where(eq(jobMilestones.jobId, jobId))
    .orderBy(asc(jobMilestones.sortOrder));
  return rows.map(toDto);
}

export async function ensureJobMilestones(db: Db, jobId: string) {
  const existing = await listJobMilestones(db, jobId);
  if (existing.length > 0) return existing;

  const now = new Date();
  const values = DEFAULT_MILESTONES.map((m) => ({
    id: `ms-${jobId}-${m.code}`,
    jobId,
    code: m.code,
    label: m.label,
    sortOrder: m.sortOrder,
    plannedAt: addDays(now, m.daysFromNow),
    actualAt: m.daysFromNow < 0 ? addDays(now, m.daysFromNow + 1) : null,
  }));

  await db.insert(jobMilestones).values(values);
  return listJobMilestones(db, jobId);
}

export async function setMilestoneComplete(db: Db, jobId: string, code: string, complete: boolean) {
  const [row] = await db
    .update(jobMilestones)
    .set({ actualAt: complete ? new Date() : null })
    .where(and(eq(jobMilestones.jobId, jobId), eq(jobMilestones.code, code)))
    .returning();
  return row ? toDto(row) : null;
}

export type JobMilestoneSummary = {
  nextCode: string | null;
  nextLabel: string | null;
  nextPlannedAt: string | null;
  atRisk: boolean;
  pendingCount: number;
};

export function summarizeMilestones(items: MilestoneDto[]): JobMilestoneSummary {
  const now = Date.now();
  const open = items.filter((m) => !m.actualAt).sort((a, b) => a.sortOrder - b.sortOrder);
  const next = open[0] ?? null;
  const atRisk = open.some((m) => m.plannedAt && new Date(m.plannedAt).getTime() < now);
  return {
    nextCode: next?.code ?? null,
    nextLabel: next?.label ?? null,
    nextPlannedAt: next?.plannedAt ?? null,
    atRisk,
    pendingCount: open.length,
  };
}

export async function listMilestonesForJobs(db: Db, jobIds: string[]) {
  if (jobIds.length === 0) return new Map<string, MilestoneDto[]>();
  const rows = await db
    .select()
    .from(jobMilestones)
    .where(inArray(jobMilestones.jobId, jobIds))
    .orderBy(asc(jobMilestones.sortOrder));
  const map = new Map<string, MilestoneDto[]>();
  for (const row of rows) {
    const dto = toDto(row);
    const list = map.get(row.jobId) ?? [];
    list.push(dto);
    map.set(row.jobId, list);
  }
  return map;
}

export async function listAtRiskJobIds(db: Db) {
  const now = new Date();
  const rows = await db
    .selectDistinct({ jobId: jobMilestones.jobId })
    .from(jobMilestones)
    .where(and(isNull(jobMilestones.actualAt), lt(jobMilestones.plannedAt, now)));
  return new Set(rows.map((r) => r.jobId));
}

export async function listPendingJobIds(db: Db) {
  const rows = await db
    .selectDistinct({ jobId: jobMilestones.jobId })
    .from(jobMilestones)
    .where(isNull(jobMilestones.actualAt));
  return new Set(rows.map((r) => r.jobId));
}

export async function filterJobsByMilestone(db: Db, jobIds: string[], filter: "at_risk" | "pending") {
  if (jobIds.length === 0) return [];
  const set = filter === "at_risk" ? await listAtRiskJobIds(db) : await listPendingJobIds(db);
  return jobIds.filter((id) => set.has(id));
}
