/**
 * Customer service cases — pure rules (no database): enums, SLA targets and timers,
 * canned-reply variables. Shared by the case service, automation and tests.
 */

export const CASE_CHANNELS = ["phone", "email", "line", "walk_in", "portal"] as const;
export const CASE_CATEGORIES = ["status_inquiry", "documents", "pricing", "complaint", "other"] as const;
export const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const CASE_STATUSES = ["new", "in_progress", "waiting_customer", "resolved", "closed"] as const;
/** Statuses where the case still needs work (SLA timers run). */
export const CASE_OPEN_STATUSES = ["new", "in_progress", "waiting_customer"] as const;

export type CaseChannel = (typeof CASE_CHANNELS)[number];
export type CaseCategory = (typeof CASE_CATEGORIES)[number];
export type CasePriority = (typeof CASE_PRIORITIES)[number];
export type CaseStatus = (typeof CASE_STATUSES)[number];

export function isOpenStatus(s: string): boolean {
  return (CASE_OPEN_STATUSES as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// SLA

export type SlaTarget = { firstResponseMinutes: number; resolveMinutes: number };
export type SlaPolicy = Record<CasePriority, SlaTarget>;

/** Built-in targets (calendar time, v1 ignores business hours). */
export const DEFAULT_SLA: SlaPolicy = {
  urgent: { firstResponseMinutes: 60, resolveMinutes: 4 * 60 },
  high: { firstResponseMinutes: 4 * 60, resolveMinutes: 24 * 60 },
  normal: { firstResponseMinutes: 8 * 60, resolveMinutes: 2 * 24 * 60 },
  low: { firstResponseMinutes: 24 * 60, resolveMinutes: 5 * 24 * 60 },
};

/** Warn ("amber") when less than this share of the SLA window is left. */
export const SLA_WARN_FRACTION = 0.25;

export function mergePolicy(rows: { priority: string; firstResponseMinutes: number; resolveMinutes: number }[]): SlaPolicy {
  const out: SlaPolicy = { ...DEFAULT_SLA };
  for (const r of rows) {
    if ((CASE_PRIORITIES as readonly string[]).includes(r.priority) && r.firstResponseMinutes > 0 && r.resolveMinutes > 0) {
      out[r.priority as CasePriority] = { firstResponseMinutes: r.firstResponseMinutes, resolveMinutes: r.resolveMinutes };
    }
  }
  return out;
}

/** Due times for a case opened at `openedAt` with `priority`. */
export function computeDue(openedAt: Date, priority: CasePriority, policy: SlaPolicy = DEFAULT_SLA) {
  const t = policy[priority] ?? DEFAULT_SLA.normal;
  return {
    firstResponseDueAt: new Date(openedAt.getTime() + t.firstResponseMinutes * 60_000),
    resolveDueAt: new Date(openedAt.getTime() + t.resolveMinutes * 60_000),
  };
}

/** ok = running, warning = < 25 % left, breached = running and late, met / late = stopped on time / after the due time. */
export type SlaState = "ok" | "warning" | "breached" | "met" | "late" | "none";

export type SlaTimer = { state: SlaState; dueAt: string | null; doneAt: string | null; leftMinutes: number | null; fractionLeft: number | null };

export function timerState(start: Date, due: Date | null, doneAt: Date | null, now: Date, stopped = false): SlaTimer {
  if (!due) return { state: "none", dueAt: null, doneAt: doneAt?.toISOString() ?? null, leftMinutes: null, fractionLeft: null };
  if (doneAt) {
    return { state: doneAt <= due ? "met" : "late", dueAt: due.toISOString(), doneAt: doneAt.toISOString(), leftMinutes: null, fractionLeft: null };
  }
  if (stopped) return { state: "none", dueAt: due.toISOString(), doneAt: null, leftMinutes: null, fractionLeft: null };
  const total = Math.max(1, due.getTime() - start.getTime());
  const left = due.getTime() - now.getTime();
  const fraction = left / total;
  const state: SlaState = left < 0 ? "breached" : fraction < SLA_WARN_FRACTION ? "warning" : "ok";
  return { state, dueAt: due.toISOString(), doneAt: null, leftMinutes: Math.round(left / 60_000), fractionLeft: Math.max(0, Math.min(1, fraction)) };
}

export type CaseSlaInput = {
  status: string;
  createdAt: Date;
  firstResponseDueAt: Date | null;
  resolveDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
};

export type CaseSla = {
  first: SlaTimer;
  resolve: SlaTimer;
  /** The timer that matters now: first response until someone replies, then resolution. */
  active: "first" | "resolve" | null;
  /** Worst running state, for chips and filters. */
  state: SlaState;
  breached: boolean;
};

export function caseSla(c: CaseSlaInput, now = new Date()): CaseSla {
  const open = isOpenStatus(c.status);
  const first = timerState(c.createdAt, c.firstResponseDueAt, c.firstRespondedAt, now, !open);
  const resolve = timerState(c.createdAt, c.resolveDueAt, c.resolvedAt, now, !open);
  let active: CaseSla["active"] = null;
  if (open) active = c.firstRespondedAt ? "resolve" : "first";
  const running = [first, resolve].filter((t) => t.state === "ok" || t.state === "warning" || t.state === "breached");
  const rank: Record<SlaState, number> = { breached: 3, warning: 2, ok: 1, late: 0, met: 0, none: 0 };
  // Running → the worst running timer; stopped → how resolution (else first response) ended.
  let state: SlaState = running.length ? running[0]!.state : resolve.state !== "none" ? resolve.state : first.state;
  for (const t of running) if (rank[t.state] > rank[state]) state = t.state;
  return { first, resolve, active, state, breached: running.some((t) => t.state === "breached") };
}

// ---------------------------------------------------------------------------
// LINE inbox: first guess at a chat's category and container number

/** ISO 6346 shape: 4 letters + 7 digits ("TCLU 330881-2" too). */
const BOX_RE = /\b([A-Z]{3}[UJZ])\s?(\d{6})-?(\d)\b/i;

export function findContainerNo(text: string): string | null {
  const m = BOX_RE.exec(text);
  return m ? `${m[1]}${m[2]}${m[3]}`.toUpperCase() : null;
}

const CATEGORY_HINTS: [CaseCategory, RegExp][] = [
  ["complaint", /ร้องเรียน|เสียหาย|บุบ|แตก|รอนาน|นานมาก|ชั่วโมงแล้ว|ช้ามาก|ไม่พอใจ|complain|damage/i],
  ["documents", /ใบเสร็จ|ใบแจ้งหนี้|ใบกำกับ|เอกสาร|d\/o|\bdo\b|eir|invoice|receipt/i],
  ["pricing", /ราคา|ค่าบริการ|ค่าฝาก|ค่าภาระ|อัตรา|เท่าไร|เท่าไหร่|quote|rate/i],
  ["status_inquiry", /สถานะ|ตู้|คิว|จอง|เช็ค|เช็ก|ถึง|ออก|เข้า|status|booking|container/i],
];

/** Cheap keyword guess so LINE cases land in a sensible column; staff can change it. */
export function guessCategory(text: string): CaseCategory {
  for (const [cat, re] of CATEGORY_HINTS) if (re.test(text)) return cat;
  return findContainerNo(text) ? "status_inquiry" : "other";
}

// ---------------------------------------------------------------------------
// Canned replies

export const CANNED_VARIABLES = ["customer", "container", "eta", "vessel", "job", "agent"] as const;
export type CannedVariable = (typeof CANNED_VARIABLES)[number];
export type CannedValues = Partial<Record<CannedVariable, string | null | undefined>>;

/**
 * Fills {customer} {container} {eta} {vessel} {job} {agent}. Unknown values are left as
 * the placeholder so the agent sees what still needs typing; `missing` lists them.
 */
export function renderCanned(template: string, values: CannedValues): { text: string; missing: CannedVariable[] } {
  const missing = new Set<CannedVariable>();
  const text = template.replace(/\{(customer|container|eta|vessel|job|agent)\}/g, (whole, key: CannedVariable) => {
    const v = values[key];
    if (v === null || v === undefined || String(v).trim() === "") {
      missing.add(key);
      return whole;
    }
    return String(v);
  });
  return { text, missing: CANNED_VARIABLES.filter((k) => missing.has(k)) };
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-06" → "6 ต.ค. 2026" / "6 Oct 2026" / "2026年10月6日". */
export function fmtCannedDate(v: string | Date | null | undefined, lang: "th" | "en" | "zh" = "th"): string | null {
  if (!v) return null;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (lang === "zh") return `${y}年${mo}月${d}日`;
  return `${d} ${(lang === "en" ? EN_MONTHS : TH_MONTHS)[mo - 1]} ${y}`;
}
