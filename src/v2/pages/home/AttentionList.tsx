import { ArrowRight, CaretRight, Clock, FileText, Package, Receipt, UserCircleDashed, type Icon } from "@phosphor-icons/react";
import { Tooltip } from "antd";
import { Link } from "react-router-dom";
import { useStore } from "../../../store";
import { EntityCard, IconBadge, StatusTag } from "../../components";
import { SEVERITY_TONE, type AttentionItem, type AttentionKind } from "./attention.ts";
import "./home.css";

export function ageLabel(tx: (k: string, v?: Record<string, string | number>) => string, days: number | null) {
  if (days === null) return "";
  if (days <= 0) return tx("home_age_today");
  return tx("home_age_days", { n: days });
}

export const KIND_ICON: Record<AttentionKind, Icon> = {
  delay: Clock,
  owner: UserCircleDashed,
  docs: FileText,
  ar: Receipt,
  container: Package,
};

/** Kind icon + reason text: the icon carries the category so the words can stay short. */
export function Reason({ item }: { item: AttentionItem }) {
  const { tx } = useStore();
  const I = KIND_ICON[item.kind];
  return (
    <span className="hm-reason">
      <I size={16} aria-label={tx(`home_kind_${item.kind}`)} role="img" className="hm-reason-icon" />
      <span>{item.reason}</span>
    </span>
  );
}

/** Compact prioritized list: severity · ref + customer · what's wrong + next step · age. */
export function AttentionList({ items, showAction }: { items: AttentionItem[]; showAction?: boolean }) {
  const { tx } = useStore();
  return (
    <ul className="hm-attn">
      {items.map((it) => (
        <li key={it.id}>
          <Link to={it.to} className="hm-attn-row">
            <span className="hm-attn-sev">
              <StatusTag status={it.severity} tone={SEVERITY_TONE[it.severity]} label={tx(`home_sev_${it.severity}`)} />
            </span>
            <span className="hm-attn-ref">
              <span className={`cz-cell-main${it.refMono ? " cz-mono" : ""}`}>{it.ref}</span>
              <span className="cz-cell-sub">{it.customer}</span>
            </span>
            <span className="hm-attn-what">
              <Reason item={it} />
              {showAction ? <span className="cz-cell-sub">{it.action}</span> : null}
            </span>
            <span className="hm-attn-age">{ageLabel(tx, it.ageDays)}</span>
            <CaretRight size={16} className="hm-attn-go" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Age as a small chip; red when more than a week old. */
export function AgeChip({ days }: { days: number | null }) {
  const { tx } = useStore();
  if (days === null) return null;
  return <span className={`hm-age${days > 7 ? " is-old" : ""}`}>{ageLabel(tx, days)}</span>;
}

/** One problem as a card: kind icon · ref · reason · customer · next step. Whole card links to the fix. */
export function AttentionCard({ item }: { item: AttentionItem }) {
  const { tx } = useStore();
  const tone = SEVERITY_TONE[item.severity];
  return (
    <EntityCard
      to={item.to}
      tone={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "default"}
      media={
        <Tooltip title={tx(`home_kind_${item.kind}`)}>
          <span>
            <IconBadge icon={KIND_ICON[item.kind]} tone={tone} size={36} />
          </span>
        </Tooltip>
      }
      title={<span className={item.refMono ? "cz-mono" : undefined}>{item.ref}</span>}
      subtitle={item.reason}
      badge={<AgeChip days={item.ageDays} />}
      footer={
        <>
          <span className="hm-card-cust">{item.customer}</span>
          <span className={`hm-next-btn is-${tone}`} title={item.action}>
            {item.short}
            <ArrowRight size={14} weight="bold" aria-hidden />
          </span>
        </>
      }
    />
  );
}
