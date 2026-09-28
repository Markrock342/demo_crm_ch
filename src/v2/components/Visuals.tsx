import { Boat, Airplane, Truck } from "@phosphor-icons/react";
import { Tooltip } from "antd";
import "./kit.css";
import { useDemoText } from "../lib/useDemoText.ts";

/* Small visual primitives that replace text-heavy cells. */

const MODE_ICON = { sea: Boat, air: Airplane, road: Truck } as const;

/** Lane as two port codes and a transport icon — "CNSHA ⛴ THLCH" instead of a sentence. */
export function LaneCell({ from, to, mode = "sea", title }: { from?: string | null; to?: string | null; mode?: keyof typeof MODE_ICON; title?: string }) {
  const Icon = MODE_ICON[mode] ?? Boat;
  return (
    <span className="cz-lane" title={title}>
      <span className="cz-port">{from || "—"}</span>
      <Icon size={14} weight="regular" aria-hidden className="cz-lane-icon" />
      <span className="cz-port">{to || "—"}</span>
    </span>
  );
}

/** First visible letter; skips Thai leading vowels (เ แ โ ใ ไ) so "โจว" → "จ". */
export function initialOf(name: string) {
  const chars = [...name.trim()];
  const first = chars.find((c) => !/[\u0E40-\u0E44]/.test(c)) ?? chars[0] ?? "";
  return first.toUpperCase();
}

const AVATAR_HUES = [200, 150, 50, 250, 20, 290, 100];

function hueFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

/** Person as an initial circle with the full name on hover — replaces "陈销售 / 赵操作" text columns. */
export function PersonAvatar({ name: raw, size = 26 }: { name?: string | null; size?: number }) {
  const dt = useDemoText();
  const name = dt(raw);
  if (!name) return <span className="cz-muted">—</span>;
  const hue = hueFor(name);
  return (
    <Tooltip title={name}>
      <span
        className="cz-person"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.46),
          background: `oklch(0.93 0.04 ${hue})`,
          color: `oklch(0.38 0.09 ${hue})`,
        }}
        aria-label={name}
        role="img"
      >
        {initialOf(name)}
      </span>
    </Tooltip>
  );
}

export function PeopleStack({ names }: { names: (string | null | undefined)[] }) {
  const list = names.filter(Boolean) as string[];
  if (!list.length) return <span className="cz-muted">—</span>;
  return (
    <span className="cz-people">
      {list.map((n) => (
        <PersonAvatar key={n} name={n} />
      ))}
    </span>
  );
}

/**
 * Voyage progress between departure and arrival: a thin track with a moving dot.
 * Dates show as small labels; overdue arrival turns the track red.
 */
export function TransitBar({
  etd,
  eta,
  etdLabel,
  etaLabel,
  delayed,
  done,
}: {
  etd?: string | Date | null;
  eta?: string | Date | null;
  etdLabel: string;
  etaLabel: string;
  delayed?: boolean;
  /** Shipment already arrived/delivered: full track, never shown as late. */
  done?: boolean;
}) {
  const s = etd ? new Date(etd).getTime() : NaN;
  const e = eta ? new Date(eta).getTime() : NaN;
  const now = Date.now();
  const raw = Number.isNaN(s) || Number.isNaN(e) || e <= s ? null : Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100));
  const pct = done ? 100 : raw;
  const late = !done && (delayed || (!Number.isNaN(e) && now > e && pct === 100));
  return (
    <span className={`cz-transit${late ? " is-late" : ""}`}>
      <span className="cz-transit-track" aria-hidden>
        <span className="cz-transit-fill" style={{ width: `${pct ?? 0}%` }} />
        {pct !== null ? <span className="cz-transit-dot" style={{ left: `${pct}%` }} /> : null}
      </span>
      <span className="cz-transit-dates">
        <span>{etdLabel}</span>
        <span>{etaLabel}</span>
      </span>
    </span>
  );
}

/** Step progress as segments (e.g. milestones 4/7) — reads faster than "4 of 7 done". */
export function StepMeter({ done, total, label }: { done: number; total: number; label?: string }) {
  const n = Math.max(total, 1);
  return (
    <span className="cz-meter" title={label ?? `${done}/${total}`}>
      <span className="cz-meter-bar" aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className={i < done ? "is-on" : undefined} />
        ))}
      </span>
      <span className="cz-meter-text">
        {done}/{total}
      </span>
    </span>
  );
}
