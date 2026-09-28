import { CalendarBlank, CaretRight, Cube, Warehouse } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { EmptyState, LaneCell, RouteTrack } from "../components";
import { laneRoute, markTone, splitLane } from "./salesUtil.ts";
import { initialOf } from "../components/Visuals.tsx";
import { useDemoText } from "../lib/useDemoText.ts";

export type MobileRow = {
  key: string;
  /** Line 1, bold: the identifier. */
  title: ReactNode;
  /** Line 1, right: status. */
  status?: ReactNode;
  /** Line 2, muted: customer / lane / owner. */
  sub?: ReactNode;
  /** Line 2, right: a number (value, TEU). */
  aside?: ReactNode;
  /** Trailing row actions (buttons). */
  actions?: ReactNode;
  onClick?: () => void;
};

/** Phone layout for lists: two stacked lines per row instead of a squashed table. */
export function SalesMobileList({ rows, empty }: { rows: MobileRow[]; empty?: ReactNode }) {
  if (rows.length === 0) return <div className="sales-mlist">{empty ?? <EmptyState />}</div>;
  return (
    <ul className="sales-mlist">
      {rows.map((r) => {
        const body = (
          <>
            <span className="sales-mrow-line">
              <span className="sales-mrow-title">{r.title}</span>
              {r.status}
            </span>
            {r.sub || r.aside ? (
              <span className="sales-mrow-line is-sub">
                <span className="sales-mrow-sub">{r.sub}</span>
                {r.aside ? <span className="sales-mrow-aside">{r.aside}</span> : null}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={r.key} className="sales-mrow">
            {r.onClick ? (
              <button type="button" className="sales-mrow-main" onClick={r.onClick}>
                {body}
              </button>
            ) : (
              <div className="sales-mrow-main">{body}</div>
            )}
            {r.actions ? <div className="sales-mrow-actions">{r.actions}</div> : null}
            {r.onClick && !r.actions ? <CaretRight size={16} className="sales-chevron" aria-hidden /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Free-text lane ("หยานเถียน → แหลมฉบัง") drawn with LaneCell; falls back to muted text. */
export function SalesLane({ lane: raw }: { lane: string | null | undefined }) {
  const dt = useDemoText();
  const lane = dt(raw);
  const parts = splitLane(lane);
  if (parts) return <LaneCell from={parts.from} to={parts.to} title={lane || undefined} />;
  return <span className="cz-muted">{lane && lane !== "—" ? lane : "—"}</span>;
}

/** Company initial in a tinted square — the "logo" of a customer or lead. */
export function CompanyMark({ name, size = 40 }: { name: string; size?: number }) {
  const dt = useDemoText();
  const n = (dt(name) || "?").trim();
  return (
    <span className={`sales-mark is-${markTone(n)}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }} aria-hidden>
      {initialOf(n)}
    </span>
  );
}

/** Free-text lane drawn as a route track with flags; a yard/inland lane shows a warehouse chip. */
export function LaneRoute({
  lane,
  size = "sm",
  names = true,
}: {
  lane: string | null | undefined;
  size?: "sm" | "md" | "lg";
  names?: boolean;
}) {
  const dt = useDemoText();
  const r = laneRoute(lane);
  if (!r) {
    if (!lane || lane === "—") return null;
    return (
      <span className="sales-chip">
        <Warehouse size={14} aria-hidden />
        {dt(lane)}
      </span>
    );
  }
  return (
    <div className="sales-route" title={dt(lane) || undefined}>
      <RouteTrack
        from={r.from}
        to={r.to}
        fromName={names || !r.from ? dt(r.fromName) : undefined}
        toName={names || !r.to ? dt(r.toName) : undefined}
        progress={null}
        size={size}
      />
    </div>
  );
}

/** "40HC × 2" as a container icon chip. */
export function ContainerChip({ type, qty }: { type?: string | null; qty?: number | null }) {
  if (!type && !qty) return null;
  return (
    <span className="sales-chip">
      <Cube size={14} weight="duotone" aria-hidden />
      <span className="cz-mono">{type ?? ""}</span>
      {qty ? <strong>×{qty}</strong> : null}
    </span>
  );
}

/** Small date chip; tone turns it amber (soon) or red (past). */
export function DateChip({ label, tone, title }: { label: string; tone?: "warning" | "danger" | "success"; title?: string }) {
  return (
    <span className={`sales-chip${tone ? ` is-${tone} is-toned` : ""}`} title={title}>
      <CalendarBlank size={14} aria-hidden />
      {label}
    </span>
  );
}
