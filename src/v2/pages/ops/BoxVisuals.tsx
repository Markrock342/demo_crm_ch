import { MapPin, Timer } from "@phosphor-icons/react";
import { Tooltip } from "antd";
import type { ReactNode } from "react";
import type { Tone } from "../../components/Graphics.tsx";
import { boxMeta, daysFromToday, parseOpsDate } from "./opsShared.ts";
import "./boxesVisual.css";

/*
 * Container pictures for the Containers (/boxes) and Yard (/yard) pages.
 * Page-local on purpose: other ops pages keep using opsShared only.
 */

/** Fallback free time after arrival when a box has no real last free day yet (tracking convention: LFD = ETA + 5). */
export const FREE_DAYS = 5;
/** Nominal China ⇄ Thailand sailing time, used to place the vessel on the route line. */
const TRANSIT_DAYS = 8;

export type BoxLike = {
  status: string;
  direction?: string | null;
  eta?: string | null;
  lastFreeDay?: string | null;
  freeDays?: number | null;
};

/**
 * Last free day: the real value (container.last_free_day) when known; otherwise an estimate
 * (ETA + free days, default 5) for inbound boxes that have arrived. `total` = free days for the bar.
 */
export function freeTimeOf(b: BoxLike): { lfd: Date; daysLeft: number; estimated: boolean; total: number } | null {
  const group = boxMeta(b.status).group;
  if (group !== "yard" && group !== "customs") return null;
  const total = b.freeDays && b.freeDays > 0 ? b.freeDays : FREE_DAYS;
  const real = b.lastFreeDay && b.lastFreeDay !== "—" ? parseOpsDate(b.lastFreeDay) : null;
  if (real) return { lfd: real, daysLeft: daysFromToday(b.lastFreeDay) ?? 0, estimated: false, total };
  if (b.direction === "out") return null;
  const eta = parseOpsDate(b.eta ?? null);
  const since = daysFromToday(b.eta ?? null);
  if (!eta || since === null || since > 0) return null;
  const lfd = new Date(eta.getTime() + total * 86_400_000);
  return { lfd, daysLeft: since + total, estimated: true, total };
}

/** Whole days a box has been on the ground (from its arrival), when we can tell. */
export function daysInYard(b: BoxLike): number | null {
  if (b.direction === "out") return null;
  const d = daysFromToday(b.eta ?? null);
  return d !== null && d <= 0 ? -d : null;
}

/** Vessel position between an estimated departure and the ETA. */
export function seaProgress(eta?: string | null): number | null {
  const e = parseOpsDate(eta ?? null);
  if (!e) return 50;
  const s = e.getTime() - TRANSIT_DAYS * 86_400_000;
  const now = Date.now();
  if (now <= s) return 6;
  return Math.max(6, Math.min(94, ((now - s) / (e.getTime() - s)) * 100));
}

/** Colour by meaning: at sea teal, yard neutral, hold/customs amber, overdue red, done green. */
export function boxTone(b: BoxLike): Tone {
  const ft = freeTimeOf(b);
  if (ft && ft.daysLeft < 0) return "danger";
  const g = boxMeta(b.status).group;
  if (g === "sea") return "primary";
  if (g === "customs") return b.status === "clear" || b.status === "do_ready" ? "success" : "warning";
  if (g === "done") return "success";
  return "neutral";
}

export function isLongBox(type?: string | null) {
  return !/^20/.test((type ?? "").trim());
}

/** "MSCU2201198" → ["MSCU", "220119", "8"] as painted on real boxes. */
function splitNo(no: string): [string, string, string] {
  const m = no.match(/^([A-Z]{4})(\d{6})(\d)$/i);
  return m ? [m[1]!.toUpperCase(), m[2]!, m[3]!] : [no, "", ""];
}

/* ── Side view ──────────────────────────────────── */

/** Side view of a container: rails, corrugated ribs, corner castings, doors on the right. */
function SideSvg({ ribs = 22, stretch = true }: { ribs?: number; stretch?: boolean }) {
  const W = 240;
  const H = 72;
  const doorX = W - 34;
  const step = (doorX - 12) / ribs;
  return (
    <svg
      className="bx-side-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={stretch ? "none" : "xMidYMid meet"}
      aria-hidden
    >
      <rect x="1" y="3" width={W - 2} height={H - 6} rx="3" className="bx-body" />
      {Array.from({ length: ribs }, (_, i) => (
        <line key={i} x1={12 + step * i + step / 2} x2={12 + step * i + step / 2} y1="10" y2={H - 10} className="bx-rib" vectorEffect="non-scaling-stroke" />
      ))}
      <line x1={doorX} x2={doorX} y1="8" y2={H - 8} className="bx-door-edge" vectorEffect="non-scaling-stroke" />
      <line x1={doorX + 17} x2={doorX + 17} y1="8" y2={H - 8} className="bx-door-edge" vectorEffect="non-scaling-stroke" />
      <line x1={doorX + 8} x2={doorX + 8} y1="10" y2={H - 10} className="bx-bar" vectorEffect="non-scaling-stroke" />
      <line x1={doorX + 26} x2={doorX + 26} y1="10" y2={H - 10} className="bx-bar" vectorEffect="non-scaling-stroke" />
      <rect x="1" y="3" width={W - 2} height="6" className="bx-rail" />
      <rect x="1" y={H - 9} width={W - 2} height="6" className="bx-rail" />
      <rect x="1" y="3" width="8" height="8" className="bx-corner" />
      <rect x={W - 9} y="3" width="8" height="8" className="bx-corner" />
      <rect x="1" y={H - 11} width="8" height="8" className="bx-corner" />
      <rect x={W - 9} y={H - 11} width="8" height="8" className="bx-corner" />
    </svg>
  );
}

/** Size badge: a tiny 20'/40' silhouette + ISO type ("40HC"). */
export function SizeBadge({ type }: { type?: string | null }) {
  const long = isLongBox(type);
  return (
    <span className="bx-size">
      <svg viewBox="0 0 22 10" width="22" height="10" aria-hidden>
        <rect x="0.5" y="1.5" width={long ? 21 : 10} height="7" rx="1" className="bx-size-box" />
        {long ? null : <rect x="11.5" y="1.5" width="10" height="7" rx="1" className="bx-size-ghost" />}
      </svg>
      <span>{type || "—"}</span>
    </span>
  );
}

/** Container-shaped header strip used on cards (stretches to the card width). */
export function BoxStrip({ no, type, tone, children }: { no: string; type?: string | null; tone: Tone; children?: ReactNode }) {
  return (
    <div className={`bx-strip is-${tone}`}>
      <SideSvg ribs={26} />
      <span className="bx-strip-no cz-mono">{no}</span>
      <span className="bx-strip-right">
        {children}
        <SizeBadge type={type} />
      </span>
    </div>
  );
}

/** Big side view for the drawer / yard detail, with the number painted on like a real box. */
export function BoxPortrait({ no, type, tone }: { no: string; type?: string | null; tone: Tone }) {
  const [owner, serial, check] = splitNo(no);
  const long = isLongBox(type);
  return (
    <div className={`bx-portrait is-${tone}${long ? "" : " is-short"}`} role="img" aria-label={`${no} · ${type ?? ""}`}>
      <SideSvg ribs={long ? 26 : 14} stretch />
      <span className="bx-portrait-paint" aria-hidden>
        <span className="bx-portrait-no cz-mono">
          {owner} <b>{serial}</b>
          {check ? <em>{check}</em> : null}
        </span>
        <span className="bx-portrait-type cz-mono">{type}</span>
      </span>
    </div>
  );
}

/* ── Top view (yard) ────────────────────────────── */

/** Bird's-eye container roof: transverse ribs, door end darker. 20' boxes fill half a slot. */
export function BoxRoof({ tone, type }: { tone: Tone; type?: string | null }) {
  const long = isLongBox(type);
  const W = long ? 120 : 58;
  const H = 44;
  const ribs = long ? 16 : 7;
  const step = (W - 14) / ribs;
  return (
    <svg className={`bx-roof is-${tone}${long ? "" : " is-short"}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="2.5" className="bx-body" />
      {Array.from({ length: ribs }, (_, i) => (
        <line key={i} x1={5 + step * (i + 0.5)} x2={5 + step * (i + 0.5)} y1="5" y2={H - 5} className="bx-rib" vectorEffect="non-scaling-stroke" />
      ))}
      <rect x={W - 9} y="1" width="8" height={H - 2} className="bx-rail" />
      <rect x="1" y="1" width="5" height="5" className="bx-corner" />
      <rect x="1" y={H - 6} width="5" height="5" className="bx-corner" />
    </svg>
  );
}

/* ── Chips & bars ───────────────────────────────── */

export function PlaceChip({ name }: { name: string }) {
  return (
    <span className="bx-place">
      <MapPin size={15} weight="fill" aria-hidden />
      <span>{name || "—"}</span>
    </span>
  );
}

/** Free-time countdown: bar shrinks as days run out; turns amber ≤3 days and red when over. */
export function FreeTimeBar({
  daysLeft,
  labels,
  hint,
  total = FREE_DAYS,
}: {
  daysLeft: number;
  labels: { left: string; over: string; last: string };
  hint?: string;
  /** Free days in the contract (bar length). */
  total?: number;
}) {
  const tone: Tone = daysLeft < 0 ? "danger" : daysLeft <= 3 ? "warning" : "success";
  const pct = daysLeft < 0 ? 100 : Math.max(4, Math.min(100, (daysLeft / Math.max(1, total)) * 100));
  const text = daysLeft < 0 ? labels.over : daysLeft === 0 ? labels.last : labels.left;
  const body = (
    <span className={`bx-free is-${tone}`}>
      <Timer size={15} weight={tone === "success" ? "regular" : "fill"} aria-hidden />
      <span className="bx-free-track">
        <span className="bx-free-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="bx-free-text">{text}</span>
    </span>
  );
  return hint ? <Tooltip title={hint}>{body}</Tooltip> : body;
}
