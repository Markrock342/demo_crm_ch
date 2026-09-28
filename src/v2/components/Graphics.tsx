import {
  Anchor,
  Boat,
  CheckCircle,
  ClipboardText,
  FlagCheckered,
  Rows,
  SquaresFour,
  Stamp,
  Truck,
  Warehouse,
  type Icon,
} from "@phosphor-icons/react";
import { Tooltip } from "antd";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "./graphics.css";

/*
 * Visual-first building blocks. Pages should reach for these before writing text:
 * flags instead of country words, a route line instead of "A → B", stage icons instead
 * of status sentences, tiles with icons instead of label/value rows.
 */

/* ── Flags ─────────────────────────────────────────── */

type FlagDef = (w: number, h: number) => ReactNode;

const FLAGS: Record<string, FlagDef> = {
  CN: (w, h) => (
    <>
      <rect width={w} height={h} fill="#de2910" />
      <polygon points="5,2.2 5.7,4.3 7.9,4.3 6.1,5.6 6.8,7.7 5,6.4 3.2,7.7 3.9,5.6 2.1,4.3 4.3,4.3" fill="#ffde00" />
    </>
  ),
  TH: (w, h) => (
    <>
      <rect width={w} height={h} fill="#a51931" />
      <rect y={h / 6} width={w} height={(h * 4) / 6} fill="#f4f5f8" />
      <rect y={h / 3} width={w} height={h / 3} fill="#2d2a4a" />
    </>
  ),
  VN: (w, h) => (
    <>
      <rect width={w} height={h} fill="#da251d" />
      <polygon points="10,3 10.9,5.8 13.8,5.8 11.4,7.5 12.3,10.3 10,8.6 7.7,10.3 8.6,7.5 6.2,5.8 9.1,5.8" fill="#ffff00" />
    </>
  ),
  MY: (w, h) => (
    <>
      <rect width={w} height={h} fill="#f4f5f8" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={(h / 14) * i * 2} width={w} height={h / 14} fill="#cc0001" />
      ))}
      <rect width={w / 2} height={h / 2} fill="#010066" />
      <circle cx={4.6} cy={3.5} r={2.2} fill="#fc0" />
      <circle cx={5.3} cy={3.5} r={1.9} fill="#010066" />
    </>
  ),
  SG: (w, h) => (
    <>
      <rect width={w} height={h / 2} fill="#ef3340" />
      <rect y={h / 2} width={w} height={h / 2} fill="#f4f5f8" />
      <circle cx={4.2} cy={3.5} r={2.2} fill="#f4f5f8" />
      <circle cx={5} cy={3.5} r={2.1} fill="#ef3340" />
    </>
  ),
  ID: (w, h) => (
    <>
      <rect width={w} height={h / 2} fill="#ce1126" />
      <rect y={h / 2} width={w} height={h / 2} fill="#f4f5f8" />
    </>
  ),
  KH: (w, h) => (
    <>
      <rect width={w} height={h} fill="#032ea1" />
      <rect y={h / 4} width={w} height={h / 2} fill="#e00025" />
      <rect x={w / 2 - 2.5} y={h / 2 - 1.8} width={5} height={3.6} fill="#f4f5f8" />
    </>
  ),
  MM: (w, h) => (
    <>
      <rect width={w} height={h / 3} fill="#fecb00" />
      <rect y={h / 3} width={w} height={h / 3} fill="#34b233" />
      <rect y={(h * 2) / 3} width={w} height={h / 3} fill="#ea2839" />
      <polygon points="10,2.5 11.2,6.2 15,6.2 11.9,8.4 13.1,12 10,9.8 6.9,12 8.1,8.4 5,6.2 8.8,6.2" fill="#f4f5f8" />
    </>
  ),
  LA: (w, h) => (
    <>
      <rect width={w} height={h} fill="#ce1126" />
      <rect y={h / 4} width={w} height={h / 2} fill="#002868" />
      <circle cx={w / 2} cy={h / 2} r={2.6} fill="#f4f5f8" />
    </>
  ),
  HK: (w, h) => (
    <>
      <rect width={w} height={h} fill="#de2910" />
      <circle cx={w / 2} cy={h / 2} r={3} fill="#f4f5f8" />
      <circle cx={w / 2} cy={h / 2} r={1.2} fill="#de2910" />
    </>
  ),
  JP: (w, h) => (
    <>
      <rect width={w} height={h} fill="#f4f5f8" />
      <circle cx={w / 2} cy={h / 2} r={3.4} fill="#bc002d" />
    </>
  ),
  KR: (w, h) => (
    <>
      <rect width={w} height={h} fill="#f4f5f8" />
      <circle cx={w / 2} cy={h / 2} r={3.2} fill="#cd2e3a" />
      <path d={`M${w / 2 - 3.2},${h / 2} a3.2,3.2 0 0,0 6.4,0 a1.6,1.6 0 0,0 -3.2,0 a1.6,1.6 0 0,1 -3.2,0`} fill="#0047a0" />
    </>
  ),
  US: (w, h) => (
    <>
      <rect width={w} height={h} fill="#f4f5f8" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={(h / 13) * i * 2} width={w} height={h / 13} fill="#b22234" />
      ))}
      <rect width={w * 0.42} height={h * 0.54} fill="#3c3b6e" />
    </>
  ),
};

/** Country flag from an ISO-2 code or a UN/LOCODE port code ("CNSHA" → CN). Unknown → code chip. */
export function Flag({ code, size = 18, title }: { code?: string | null; size?: number; title?: string }) {
  const cc = (code ?? "").trim().toUpperCase().slice(0, 2);
  const def = FLAGS[cc];
  const w = 20;
  const h = 14;
  if (!def) {
    return (
      <span className="cz-flag cz-flag-chip" style={{ height: Math.round(size * 0.7) }} title={title}>
        {cc || "··"}
      </span>
    );
  }
  return (
    <svg
      className="cz-flag"
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={Math.round((size * h) / w)}
      role="img"
      aria-label={title ?? cc}
    >
      {title ? <title>{title}</title> : null}
      {def(w, h)}
    </svg>
  );
}

/** Port as flag + code (+ optional place name under it). */
export function Port({ code, name, align = "start", size = "md" }: { code?: string | null; name?: string | null; align?: "start" | "end"; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`cz-port-badge is-${align} is-${size}`}>
      <span className="cz-port-line">
        <Flag code={code} size={size === "lg" ? 22 : size === "sm" ? 14 : 18} />
        <strong>{code || "—"}</strong>
      </span>
      {name ? <span className="cz-port-name">{name}</span> : null}
    </span>
  );
}

/* ── Route track ───────────────────────────────────── */

type RouteProps = {
  from?: string | null;
  to?: string | null;
  fromName?: string | null;
  toName?: string | null;
  /** 0–100; null hides the vessel marker (not departed / unknown). */
  progress?: number | null;
  fromDate?: string;
  toDate?: string;
  delayed?: boolean;
  done?: boolean;
  mode?: "sea" | "road";
  size?: "sm" | "md" | "lg";
};

/** Origin flag ── vessel on the line ── destination flag. The picture of a shipment. */
export function RouteTrack({ from, to, fromName, toName, progress, fromDate, toDate, delayed, done, mode = "sea", size = "md" }: RouteProps) {
  const pct = done ? 100 : progress === null || progress === undefined ? null : Math.max(0, Math.min(100, progress));
  const Vehicle = mode === "road" ? Truck : Boat;
  return (
    <div className={`cz-route is-${size}${delayed && !done ? " is-late" : ""}${done ? " is-done" : ""}`}>
      <Port code={from} name={fromName} size={size} />
      <div className="cz-route-mid">
        <div className="cz-route-line" aria-hidden>
          <span className="cz-route-fill" style={{ width: `${pct ?? 0}%` }} />
          {pct !== null ? (
            <span className="cz-route-vehicle" style={{ left: `${pct}%` }}>
              {done ? <CheckCircle size={size === "lg" ? 20 : 16} weight="fill" /> : <Vehicle size={size === "lg" ? 20 : 16} weight="fill" />}
            </span>
          ) : null}
        </div>
        {fromDate || toDate ? (
          <div className="cz-route-dates">
            <span>{fromDate}</span>
            <span className="cz-route-eta">{toDate}</span>
          </div>
        ) : null}
      </div>
      <Port code={to} name={toName} align="end" size={size} />
    </div>
  );
}

/** Progress % between two dates, null when either is missing. */
export function progressBetween(start?: string | Date | null, end?: string | Date | null, now = Date.now()): number | null {
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  if (now < s) return 0;
  return Math.min(100, ((now - s) / (e - s)) * 100);
}

/* ── Stage flow ────────────────────────────────────── */

export type StageKey = "booked" | "gatein" | "sailed" | "arrived" | "customs" | "delivered";

export const SHIPMENT_STAGES: { key: StageKey; icon: Icon }[] = [
  { key: "booked", icon: ClipboardText },
  { key: "gatein", icon: Warehouse },
  { key: "sailed", icon: Boat },
  { key: "arrived", icon: Anchor },
  { key: "customs", icon: Stamp },
  { key: "delivered", icon: FlagCheckered },
];

type StageFlowProps = {
  /** Index of the current stage (0-based). Stages before it are done. -1 = not started. */
  current: number;
  /** Labels per stage key (translated by the page: tx(`stage_${key}`)). */
  labels: Record<StageKey, string>;
  /** Optional date/sub-line under each stage. */
  dates?: Partial<Record<StageKey, string>>;
  problem?: boolean;
  size?: "sm" | "lg";
};

/** Six shipment stages as connected icons: done (filled), now (ringed), next (grey). */
export function StageFlow({ current, labels, dates, problem, size = "lg" }: StageFlowProps) {
  return (
    <ol className={`cz-stages is-${size}`}>
      {SHIPMENT_STAGES.map((s, i) => {
        const state = i < current ? "done" : i === current ? (problem ? "problem" : "now") : "next";
        const body = (
          <li key={s.key} className={`cz-stage is-${state}`}>
            <span className="cz-stage-dot">
              <s.icon size={size === "lg" ? 20 : 14} weight={state === "next" ? "regular" : "fill"} aria-hidden />
            </span>
            {size === "lg" ? (
              <span className="cz-stage-text">
                <span className="cz-stage-label">{labels[s.key]}</span>
                {dates?.[s.key] ? <span className="cz-stage-date">{dates[s.key]}</span> : null}
              </span>
            ) : null}
          </li>
        );
        return size === "sm" ? (
          <Tooltip key={s.key} title={labels[s.key]}>
            {body}
          </Tooltip>
        ) : (
          body
        );
      })}
    </ol>
  );
}

/* ── Tiles, cards, boards ──────────────────────────── */

export type Tone = "primary" | "accent" | "success" | "warning" | "danger" | "info" | "neutral";

/** Icon in a tinted circle — the visual anchor for tiles, cards and list rows. */
export function IconBadge({ icon: I, tone = "primary", size = 40 }: { icon: Icon; tone?: Tone; size?: number }) {
  return (
    <span className={`cz-icon-badge is-${tone}`} style={{ width: size, height: size }} aria-hidden>
      <I size={Math.round(size * 0.5)} weight="duotone" />
    </span>
  );
}

type TileProps = {
  icon: Icon;
  tone?: Tone;
  value: ReactNode;
  label: string;
  /** Tiny visual under the value: <MiniBar/> etc. */
  visual?: ReactNode;
  to?: string;
};

/** Metric tile: icon, big number, short label, optional mini visual. Link it to its filtered list. */
export function Tile({ icon, tone = "primary", value, label, visual, to }: TileProps) {
  const inner = (
    <>
      <IconBadge icon={icon} tone={tone} />
      <span className="cz-tile-body">
        <span className={`cz-tile-value is-${tone}`}>{value}</span>
        <span className="cz-tile-label">{label}</span>
        {visual ? <span className="cz-tile-visual">{visual}</span> : null}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="cz-tile is-link">
      {inner}
    </Link>
  ) : (
    <div className="cz-tile">{inner}</div>
  );
}

export function TileRow({ children }: { children: ReactNode }) {
  return <div className="cz-tiles">{children}</div>;
}

/** Proportion bar with segments (e.g. AR aging, job states). */
export function SegmentBar({ parts, height = 10 }: { parts: { value: number; tone: Tone; label: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <span className="cz-segbar" style={{ height }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <Tooltip key={p.label} title={`${p.label}: ${p.value}`}>
            <span className={`cz-seg is-${p.tone}`} style={{ flexGrow: p.value / total }} />
          </Tooltip>
        ))}
    </span>
  );
}

/** Horizontal bar list — label, bar, value. For top-N comparisons. */
export function BarList({ items, tone = "primary", format = (n: number) => String(n) }: { items: { label: ReactNode; value: number; to?: string }[]; tone?: Tone; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="cz-barlist">
      {items.map((it, idx) => {
        const row = (
          <>
            <span className="cz-barlist-label">{it.label}</span>
            <span className="cz-barlist-track">
              <span className={`cz-barlist-bar is-${tone}`} style={{ width: `${(it.value / max) * 100}%` }} />
            </span>
            <span className="cz-barlist-value">{format(it.value)}</span>
          </>
        );
        return (
          <li key={idx}>
            {it.to ? (
              <Link to={it.to} className="cz-barlist-row">
                {row}
              </Link>
            ) : (
              <span className="cz-barlist-row">{row}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Donut with a centre number. Parts are drawn in order. */
export function Donut({ parts, size = 120, center, caption }: { parts: { value: number; tone: Tone; label: string }[]; size?: number; center?: ReactNode; caption?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <span className="cz-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} className="cz-donut-track" />
        {total > 0
          ? parts.map((p) => {
              const len = (p.value / total) * c;
              const el = (
                <circle
                  key={p.label}
                  cx="50"
                  cy="50"
                  r={r}
                  className={`cz-donut-seg is-${p.tone}`}
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += len;
              return el;
            })
          : null}
      </svg>
      <span className="cz-donut-center">
        <strong>{center ?? total}</strong>
        {caption ? <em>{caption}</em> : null}
      </span>
    </span>
  );
}

/** Legend dots for SegmentBar / Donut. */
export function Legend({ items }: { items: { tone: Tone; label: string; value?: ReactNode }[] }) {
  return (
    <ul className="cz-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`cz-legend-dot is-${i.tone}`} />
          <span>{i.label}</span>
          {i.value !== undefined ? <strong>{i.value}</strong> : null}
        </li>
      ))}
    </ul>
  );
}

type CardProps = {
  to?: string;
  onClick?: () => void;
  /** Top-left identity: an IconBadge, Flag pair, or avatar. */
  media?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Top-right: StatusTag or a warning icon. */
  badge?: ReactNode;
  /** The visual body: RouteTrack, StageFlow, BarList… */
  children?: ReactNode;
  /** Bottom row: people, dates, amount. */
  footer?: ReactNode;
  tone?: "default" | "danger" | "warning";
};

/** The card used by every card/board view. */
export function EntityCard({ to, onClick, media, title, subtitle, badge, children, footer, tone = "default" }: CardProps) {
  const inner = (
    <>
      <div className="cz-card-head">
        {media ? <span className="cz-card-media">{media}</span> : null}
        <span className="cz-card-titles">
          <span className="cz-card-title">{title}</span>
          {subtitle ? <span className="cz-card-sub">{subtitle}</span> : null}
        </span>
        {badge ? <span className="cz-card-badge">{badge}</span> : null}
      </div>
      {children ? <div className="cz-card-body">{children}</div> : null}
      {footer ? <div className="cz-card-foot">{footer}</div> : null}
    </>
  );
  const cls = `cz-card is-${tone}`;
  if (to)
    return (
      <Link to={to} className={`${cls} is-link`}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" className={`${cls} is-link`} onClick={onClick}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/** Responsive card grid (auto-fills, min card width configurable). */
export function CardGrid({ children, min = 320 }: { children: ReactNode; min?: number }) {
  return (
    <div className="cz-card-grid" style={{ ["--min" as string]: `${min}px` }}>
      {children}
    </div>
  );
}

/** Kanban-style board: columns with an icon, count and cards. Scrolls sideways inside itself. */
export function Board({ columns }: { columns: { key: string; icon?: Icon; tone?: Tone; title: string; count?: number; children: ReactNode }[] }) {
  return (
    <div className="cz-board">
      {columns.map((col) => (
        <section key={col.key} className="cz-board-col">
          <header className="cz-board-head">
            {col.icon ? <IconBadge icon={col.icon} tone={col.tone ?? "neutral"} size={28} /> : null}
            <h3>{col.title}</h3>
            {col.count !== undefined ? <span className="cz-board-count">{col.count}</span> : null}
          </header>
          <div className="cz-board-body">{col.children}</div>
        </section>
      ))}
    </div>
  );
}

/** Cards ⇄ list toggle (icon-only, labelled for screen readers). */
export function ViewSwitch({ value, onChange, labels }: { value: "cards" | "list"; onChange: (v: "cards" | "list") => void; labels: { cards: string; list: string } }) {
  return (
    <span className="cz-viewswitch" role="group">
      <Tooltip title={labels.cards}>
        <button type="button" aria-pressed={value === "cards"} aria-label={labels.cards} onClick={() => onChange("cards")}>
          <SquaresFour size={18} weight={value === "cards" ? "fill" : "regular"} />
        </button>
      </Tooltip>
      <Tooltip title={labels.list}>
        <button type="button" aria-pressed={value === "list"} aria-label={labels.list} onClick={() => onChange("list")}>
          <Rows size={18} weight={value === "list" ? "fill" : "regular"} />
        </button>
      </Tooltip>
    </span>
  );
}

/** Remembered cards/list preference per page (safe when storage is unavailable). */
export function readView(key: string, fallback: "cards" | "list" = "cards"): "cards" | "list" {
  try {
    const v = localStorage.getItem(`cz.view.${key}`);
    return v === "list" || v === "cards" ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writeView(key: string, v: "cards" | "list") {
  try {
    localStorage.setItem(`cz.view.${key}`, v);
  } catch {
    /* ignore */
  }
}
