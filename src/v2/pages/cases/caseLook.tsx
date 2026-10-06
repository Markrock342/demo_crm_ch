import {
  Archive,
  ArrowsClockwise,
  Boat,
  ChatCircleDots,
  ChatCircleText,
  CheckCircle,
  EnvelopeSimple,
  FileText,
  Globe,
  HourglassMedium,
  Phone,
  Sparkle,
  Storefront,
  Tag,
  Timer,
  WarningOctagon,
  type Icon,
} from "@phosphor-icons/react";
import { Tooltip } from "antd";
import { useEffect, useState } from "react";
import type { CaseCategory, CaseChannel, CaseDto, CasePriority, CaseStatus, SlaState, SlaTimer } from "../../../api/cases.ts";
import type { Tone } from "../../components/Graphics.tsx";

type Tx = (k: string, v?: Record<string, string | number>) => string;

export const CATEGORY_LOOK: Record<CaseCategory, { icon: Icon; tone: Tone }> = {
  status_inquiry: { icon: Boat, tone: "info" },
  documents: { icon: FileText, tone: "primary" },
  pricing: { icon: Tag, tone: "accent" },
  complaint: { icon: WarningOctagon, tone: "danger" },
  other: { icon: ChatCircleDots, tone: "neutral" },
};

export const CHANNEL_ICON: Record<CaseChannel, Icon> = {
  phone: Phone,
  email: EnvelopeSimple,
  line: ChatCircleText,
  walk_in: Storefront,
  portal: Globe,
};

export const STATUS_LOOK: Record<CaseStatus, { icon: Icon; tone: Tone }> = {
  new: { icon: Sparkle, tone: "info" },
  in_progress: { icon: ArrowsClockwise, tone: "primary" },
  waiting_customer: { icon: HourglassMedium, tone: "warning" },
  resolved: { icon: CheckCircle, tone: "success" },
  closed: { icon: Archive, tone: "neutral" },
};

export const PRIORITY_LEVEL: Record<CasePriority, number> = { low: 1, normal: 2, high: 3, urgent: 4 };

/** Priority as a 4-bar meter (one bar = low … four = urgent). */
export function PriorityMeter({ priority, tx, showLabel = false }: { priority: CasePriority; tx: Tx; showLabel?: boolean }) {
  const level = PRIORITY_LEVEL[priority] ?? 2;
  const label = tx(`cs_pri_${priority}`);
  return (
    <Tooltip title={showLabel ? undefined : `${tx("cs_priority")}: ${label}`}>
      <span className={`cs-pri is-${priority}`} role="img" aria-label={`${tx("cs_priority")}: ${label}`}>
        <span className="cs-pri-bars" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={i <= level ? "is-on" : undefined} style={{ height: 4 + i * 2.5 }} />
          ))}
        </span>
        {showLabel ? <span className="cs-pri-label">{label}</span> : null}
      </span>
    </Tooltip>
  );
}

export function CategoryIcon({ category, tx, size = 18 }: { category: CaseCategory; tx: Tx; size?: number }) {
  const look = CATEGORY_LOOK[category] ?? CATEGORY_LOOK.other;
  return (
    <Tooltip title={tx(`cs_cat_${category}`)}>
      <span className={`cs-cat-icon is-${look.tone}`} role="img" aria-label={tx(`cs_cat_${category}`)}>
        <look.icon size={size} weight="duotone" />
      </span>
    </Tooltip>
  );
}

export function ChannelIcon({ channel, tx, size = 16 }: { channel: CaseChannel; tx: Tx; size?: number }) {
  const I = CHANNEL_ICON[channel] ?? ChatCircleDots;
  return (
    <Tooltip title={tx(`cs_ch_${channel}`)}>
      <span className={`cs-channel${channel === "line" ? " is-line" : ""}`} role="img" aria-label={tx(`cs_ch_${channel}`)}>
        <I size={size} weight={channel === "line" ? "fill" : "regular"} />
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// SLA (live, recomputed on the client so countdowns tick without refetching)

const OPEN = new Set(["new", "in_progress", "waiting_customer"]);
const WARN = 0.25;

function timer(start: string, due: string | null, done: string | null, now: number, stopped: boolean): SlaTimer {
  if (!due) return { state: "none", dueAt: null, doneAt: done, leftMinutes: null, fractionLeft: null };
  const d = new Date(due).getTime();
  if (done) return { state: new Date(done).getTime() <= d ? "met" : "late", dueAt: due, doneAt: done, leftMinutes: null, fractionLeft: null };
  if (stopped) return { state: "none", dueAt: due, doneAt: null, leftMinutes: null, fractionLeft: null };
  const total = Math.max(1, d - new Date(start).getTime());
  const left = d - now;
  const fraction = left / total;
  return {
    state: left < 0 ? "breached" : fraction < WARN ? "warning" : "ok",
    dueAt: due,
    doneAt: null,
    leftMinutes: Math.round(left / 60_000),
    fractionLeft: Math.max(0, Math.min(1, fraction)),
  };
}

export type LiveSla = { first: SlaTimer; resolve: SlaTimer; active: "first" | "resolve" | null; current: SlaTimer | null };

export function liveSla(c: CaseDto, now = Date.now()): LiveSla {
  const open = OPEN.has(c.status);
  const first = timer(c.createdAt, c.firstResponseDueAt, c.firstRespondedAt, now, !open);
  const resolve = timer(c.createdAt, c.resolveDueAt, c.resolvedAt, now, !open);
  const active = open ? (c.firstRespondedAt ? "resolve" : "first") : null;
  let current: SlaTimer | null = active === "first" ? first : active === "resolve" ? resolve : null;
  // A breached resolution timer outranks an on-time first-response timer.
  if (current && resolve.state === "breached" && current !== resolve) current = resolve;
  return { first, resolve, active, current };
}

/** Re-render every `ms` so SLA countdowns stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function fmtDuration(tx: Tx, minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return tx("cs_dur_m", { n: Math.max(1, m) });
  if (m < 48 * 60) return tx("cs_dur_h", { n: Math.round(m / 60) });
  return tx("cs_dur_d", { n: Math.round(m / 1440) });
}

const SLA_TONE: Record<SlaState, Tone> = { ok: "primary", warning: "warning", breached: "danger", met: "success", late: "neutral", none: "neutral" };

export function slaText(tx: Tx, t: SlaTimer): string {
  if (t.state === "met") return tx("cs_sla_met");
  if (t.state === "late") return tx("cs_sla_late");
  if (t.leftMinutes === null) return tx("cs_sla_none");
  return t.leftMinutes < 0 ? tx("cs_sla_over", { time: fmtDuration(tx, t.leftMinutes) }) : tx("cs_sla_left", { time: fmtDuration(tx, t.leftMinutes) });
}

/** Countdown chip: teal running, amber < 25 % left, red breached, green met. */
export function SlaChip({ t, tx, which }: { t: SlaTimer | null; tx: Tx; which?: "first" | "resolve" | null }) {
  if (!t || t.state === "none") return null;
  const label = which ? `${tx(which === "first" ? "cs_sla_first" : "cs_sla_resolve")}: ${slaText(tx, t)}` : slaText(tx, t);
  return (
    <Tooltip title={which ? tx(which === "first" ? "cs_sla_first" : "cs_sla_resolve") : undefined}>
      <span className={`cs-sla is-${SLA_TONE[t.state]}`} aria-label={label}>
        {t.state === "met" ? <CheckCircle size={14} weight="fill" aria-hidden /> : <Timer size={14} weight="bold" aria-hidden />}
        {slaText(tx, t)}
      </span>
    </Tooltip>
  );
}

export function slaTone(t: SlaTimer | null): Tone {
  return t ? SLA_TONE[t.state] : "neutral";
}

export function customerLabel(c: { customer: CaseDto["customer"] }, locale: string, fallback = ""): string {
  const n = c.customer;
  if (!n) return fallback;
  const pick = locale === "zh" ? n.zh : locale === "en" ? n.en : n.th;
  return pick || n.th || n.en || n.zh || fallback;
}
