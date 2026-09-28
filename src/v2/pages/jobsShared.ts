import { useEffect, useState } from "react";

/** Small helpers shared by the jobs-area pages (quotations, wizard, jobs, job detail). */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A person's display name, or "" when all we have is an internal id (UUID / "u1" style).
 * Last-resort guard only: live owner ids should first go through `useUserLookup().nameOf`
 * (src/v2/hooks/useUserLookup.ts), which resolves them to real names.
 */
export function personName(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s || s === "—" || s === "-") return "";
  if (UUID_RE.test(s)) return "";
  if (/^[a-z]{1,3}\d+$/i.test(s)) return "";
  return s;
}

/** "—" / empty / "-" all mean "not known". */
export function known(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return !s || s === "—" || s === "-" ? "" : s;
}

type Tx = (key: string, vars?: Record<string, string | number>) => string;

/** Translate a known milestone code, fall back to the stored label. */
export function milestoneLabel(tx: Tx, code: string, label: string): string {
  const key = `jobs_ms_${code}`;
  const t = tx(key);
  return t !== key ? t : label;
}

/** Translate a transport mode code (SEA_FCL → "Sea, full container (FCL)"). */
export function modeLabel(tx: Tx, mode: string | null | undefined): string {
  if (!mode) return "";
  const key = `jobs_mode_${mode}`;
  const t = tx(key);
  return t !== key ? t : mode;
}

export const QUOTE_TAB_STATUSES: Record<string, string[]> = {
  draft: ["DRAFT"],
  approval: ["PENDING_APPROVAL", "APPROVED"],
  sent: ["SENT"],
  accepted: ["ACCEPTED"],
  closed: ["REJECTED", "EXPIRED", "CANCELLED", "VOID"],
};

/** True at phone width (≤640px) — lists switch from tables to stacked rows. */
export function useIsPhone(): boolean {
  const q = "(max-width: 640px)";
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

const INTL: Record<string, string> = { zh: "zh-CN", th: "th-TH-u-ca-gregory", en: "en-GB" };

/** Short day + month ("18 ก.ย." / "18 Sep" / "9月18日") for compact visuals; "—" if unknown. */
export function fmtShortDate(v: string | null | undefined, locale: string): string {
  const s = known(v);
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat(INTL[locale] ?? "en-GB", { day: "numeric", month: "short" }).format(d);
}

/* ── Shipment stage (0 booked … 5 delivered) ──────────────────────────────
 * Same meaning as home/attention.ts `jobStage` (Overview links to /jobs?stage=<key>),
 * extended with the live milestone codes (SI, LOADED, CLEAR).
 */

export const STAGE_KEYS = ["booked", "gatein", "sailed", "arrived", "customs", "delivered"] as const;
export type JobStageKey = (typeof STAGE_KEYS)[number];

/** Stage reached once the milestone with this code is done. */
const REACHED: Record<string, number> = {
  QUOTE_ACCEPTED: 0,
  BOOKING: 0,
  SI: 0,
  CONTAINER: 0,
  GATE_IN: 1,
  LOADED: 1,
  SAILED: 2,
  ARRIVED: 3,
  CLEAR: 4,
  DO: 4,
  DELIVERED: 5,
  POD: 5,
  INVOICED: 5,
  PAID: 5,
};

/** Stage a job is at while this milestone is the next open one. */
const WHILE_NEXT: Record<string, number> = {
  QUOTE_ACCEPTED: 0,
  BOOKING: 0,
  SI: 0,
  CONTAINER: 0,
  GATE_IN: 0,
  LOADED: 1,
  SAILED: 1,
  ARRIVED: 2,
  CLEAR: 3,
  DO: 3,
  DELIVERED: 4,
  POD: 5,
  INVOICED: 5,
  PAID: 5,
};

function dayStart(v: string | null | undefined): number | null {
  const s = known(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function stageByDate(etd: string | null | undefined, eta: string | null | undefined, now: number): number {
  const d = dayStart(etd);
  const a = dayStart(eta);
  return a !== null && a <= now ? 3 : d !== null && d <= now ? 2 : 0;
}

type StageInput = { status: string; etd?: string | null; eta?: string | null };

/**
 * Stage from the list API's next open milestone (null = none left / unknown).
 * Dates win while milestones lag behind (ship clearly left but gate-in not ticked).
 */
export function stageFromNext(j: StageInput, nextCode: string | null | undefined, allDone = false, now = Date.now()): number {
  if (j.status === "CLOSED") return 5;
  const byDate = stageByDate(j.etd, j.eta, now);
  if (!nextCode) return allDone ? Math.max(4, byDate) : byDate;
  const s = WHILE_NEXT[nextCode];
  if (s === undefined) return byDate;
  // Customs next but the ship hasn't reached port yet → still at sea.
  if (s === 3 && byDate < 3) return 2;
  return s <= 1 ? Math.max(s, byDate) : s;
}

/** Stage from a full milestone list (job detail). */
export function stageFromMilestones(j: StageInput, ms: { code: string; actualAt: string | null }[], now = Date.now()): number {
  if (j.status === "CLOSED") return 5;
  const next = ms.find((m) => !m.actualAt);
  if (ms.length && !next) {
    const reached = Math.max(0, ...ms.map((m) => REACHED[m.code] ?? 0));
    return Math.max(reached, stageByDate(j.etd, j.eta, now));
  }
  return stageFromNext(j, next?.code ?? null, false, now);
}

/** Date shown under each stage on the job detail StageFlow: actual first, then plan (ETD/ETA). */
export function stageDates(
  j: { etd?: string | null; eta?: string | null },
  ms: { code: string; actualAt: string | null; plannedAt?: string | null }[],
  fmt: (v: string) => string,
): Partial<Record<JobStageKey, string>> {
  const actual: Partial<Record<JobStageKey, string>> = {};
  const plan: Partial<Record<JobStageKey, string>> = {};
  for (const m of ms) {
    const s = REACHED[m.code];
    if (s === undefined) continue;
    const key = STAGE_KEYS[s];
    if (m.actualAt && !actual[key]) actual[key] = m.actualAt;
    if (m.plannedAt && !plan[key]) plan[key] = m.plannedAt;
  }
  // The vessel schedule beats template plan dates for departure / arrival.
  if (known(j.etd)) plan.sailed = j.etd!;
  if (known(j.eta)) plan.arrived = j.eta!;
  const out: Partial<Record<JobStageKey, string>> = {};
  for (const k of STAGE_KEYS) {
    const v = actual[k] ?? plan[k];
    if (v) out[k] = fmt(v);
  }
  return out;
}

export function isStageKey(v: string | null | undefined): v is JobStageKey {
  return Boolean(v) && (STAGE_KEYS as readonly string[]).includes(v as string);
}
