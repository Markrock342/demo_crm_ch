import { useStore } from "../../store";
import "./kit.css";

export type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

const TONES: Record<string, Tone> = {
  DRAFT: "neutral",
  CLOSED: "neutral",
  CANCELLED: "neutral",
  VOID: "neutral",
  EXPIRED: "neutral",
  OPEN: "progress",
  IN_PROGRESS: "progress",
  SENT: "info",
  BOOKED: "info",
  IN_TRANSIT: "info",
  ISSUED: "info",
  INVOICED: "info",
  ARRIVED: "progress",
  PENDING: "warning",
  WAIT: "warning",
  WATCH: "warning",
  PARTIAL: "warning",
  PARTIALLY_PAID: "warning",
  PENDING_APPROVAL: "warning",
  BOOKING: "info",
  GATE_IN: "progress",
  SAILED: "info",
  UNBILLED: "warning",
  DELIVERED: "success",
  ACCEPTED: "success",
  APPROVED: "success",
  PAID: "success",
  DONE: "success",
  REJECTED: "danger",
  OVERDUE: "danger",
  LATE: "danger",
  DELAYED: "danger",
  DELAY: "danger",
  RISK: "danger",
};

type Props = {
  status: string;
  /** Override the translated label. */
  label?: string;
  /** Override the tone derived from status. */
  tone?: Tone;
};

/** Status pill with a translated label ("status_<KEY>" in i18n) and a meaning-carrying color. */
export function StatusTag({ status, label, tone }: Props) {
  const { tx } = useStore();
  const key = String(status).trim().toUpperCase().replace(/[\s-]+/g, "_");
  const i18nKey = `status_${key}`;
  const translated = tx(i18nKey);
  const text = label ?? (translated !== i18nKey ? translated : String(status).replace(/_/g, " ").toLowerCase());
  return (
    <span className={`cz-status-tag is-${tone ?? TONES[key] ?? "neutral"}`}>
      <span className="cz-status-dot" aria-hidden />
      {text}
    </span>
  );
}
