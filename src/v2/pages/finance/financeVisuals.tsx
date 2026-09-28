import { Boat, Buildings, CheckCircle, Clock, Stamp, Truck, Warehouse, WarningCircle, type Icon } from "@phosphor-icons/react";
import { Button, Segmented, Tooltip } from "antd";
import type { ReactNode } from "react";
import { useStore } from "../../../store";
import { IconBadge } from "../../components";
import { fmtDate } from "../../lib/format.ts";
import { daysUntil } from "./financeKit.tsx";
import "./finance.css";

/** Tone set of the visual kit (Graphics.tsx). */
export type Tone = "primary" | "accent" | "success" | "warning" | "danger" | "info" | "neutral";

/** Vendor type → picture. Accepts shell ("shipping_line") and live ("SHIPPING_LINE") values. */
const VENDOR_ICON: Record<string, { icon: Icon; tone: Tone }> = {
  shipping_line: { icon: Boat, tone: "primary" },
  carrier: { icon: Boat, tone: "primary" },
  trucking: { icon: Truck, tone: "accent" },
  trucker: { icon: Truck, tone: "accent" },
  customs: { icon: Stamp, tone: "info" },
  depot: { icon: Warehouse, tone: "neutral" },
  warehouse: { icon: Warehouse, tone: "success" },
  other: { icon: Buildings, tone: "neutral" },
};

export function vendorVisual(type: string | null | undefined) {
  return VENDOR_ICON[(type ?? "").toLowerCase()] ?? VENDOR_ICON.other!;
}

export function VendorBadge({ type, size = 40, label }: { type: string | null | undefined; size?: number; label?: string }) {
  const v = vendorVisual(type);
  const badge = <IconBadge icon={v.icon} tone={v.tone} size={size} />;
  return label ? (
    <Tooltip title={label}>
      <span>{badge}</span>
    </Tooltip>
  ) : (
    badge
  );
}

/** Due date as a coloured chip: red "overdue N days", amber "in N days", green tick when settled. */
export function DueChip({ date, open, paid }: { date: string | null | undefined; open: boolean; paid?: boolean }) {
  const { tx, locale } = useStore();
  if (paid)
    return (
      <span className="fin-duechip is-success">
        <CheckCircle size={14} weight="fill" aria-hidden />
        {tx("fin_tabPaid")}
      </span>
    );
  const d = daysUntil(date);
  if (!date || d === null) return null;
  if (open && d < 0)
    return (
      <Tooltip title={fmtDate(date, locale)}>
        <span className="fin-duechip is-danger">
          <WarningCircle size={14} weight="fill" aria-hidden />
          {tx("fin_overdueDays", { n: -d })}
        </span>
      </Tooltip>
    );
  if (open && d <= 7)
    return (
      <Tooltip title={fmtDate(date, locale)}>
        <span className="fin-duechip is-warning">
          <Clock size={14} weight="fill" aria-hidden />
          {d === 0 ? tx("fin_dueToday") : tx("fin_dueInDays", { n: d })}
        </span>
      </Tooltip>
    );
  return (
    <span className="fin-duechip is-neutral">
      <Clock size={14} aria-hidden />
      {fmtDate(date, locale)}
    </span>
  );
}

/** Section heading with an icon badge and a count bubble. */
export function GroupHead({ icon, tone, title, count, extra }: { icon: Icon; tone: Tone; title: string; count: number; extra?: ReactNode }) {
  return (
    <header className="fin-group-head">
      <IconBadge icon={icon} tone={tone} size={30} />
      <h2>{title}</h2>
      <span className={`fin-count is-${tone}`}>{count}</span>
      {extra ? <span className="fin-group-extra">{extra}</span> : null}
    </header>
  );
}

/** Icon-only action with tooltip + accessible label. */
export function IconAction({
  icon: I,
  label,
  onClick,
  href,
  loading,
  primary,
}: {
  icon: Icon;
  label: string;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  primary?: boolean;
}) {
  return (
    <Tooltip title={label}>
      <Button
        className={`fin-iconbtn${primary ? " is-primary" : ""}`}
        size="middle"
        type={primary ? "primary" : "default"}
        aria-label={label}
        icon={<I size={18} weight={primary ? "bold" : "regular"} />}
        onClick={onClick}
        href={href}
        target={href ? "_blank" : undefined}
        rel={href ? "noreferrer" : undefined}
        loading={loading}
      />
    </Tooltip>
  );
}

/** Currency picker for graphics (only shown when more than one currency is in play). */
export function CurrencyPick({ value, options, onChange }: { value: string; options: string[]; onChange: (c: string) => void }) {
  if (options.length < 2) return <span className="fin-cur-chip">{value}</span>;
  return <Segmented size="small" value={value} onChange={(v) => onChange(String(v))} options={options} />;
}

/** Big money number, split so the currency sign stays small. */
export function BigMoney({ text, tone }: { text: string; tone?: "danger" | "muted" | "default" }) {
  return <span className={`fin-bigmoney${tone && tone !== "default" ? ` is-${tone}` : ""}`}>{text}</span>;
}
