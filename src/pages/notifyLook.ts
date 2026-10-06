import { CalendarX, Clock, FileX, Receipt, Timer, Warning, FileText, Lifebuoy, Alarm, type Icon } from "@phosphor-icons/react";
import type { AppNotification, RuleKey } from "../api/notifications.ts";
import type { Locale } from "../i18n";
import type { Tone } from "../v2/components/Graphics.tsx";
import { fmtDate, fmtMoney } from "../v2/lib/format.ts";

/** Order rules appear in (ops first, then money, then sales). */
export const RULE_ORDER: RuleKey[] = ["job_delayed", "eta_changed", "doc_missing", "free_time", "invoice_overdue", "quote_expiring", "case_assigned", "case_sla"];

export const RULE_LOOK: Record<RuleKey, { icon: Icon; tone: Tone }> = {
  job_delayed: { icon: Clock, tone: "danger" },
  eta_changed: { icon: CalendarX, tone: "info" },
  doc_missing: { icon: FileX, tone: "warning" },
  free_time: { icon: Timer, tone: "warning" },
  invoice_overdue: { icon: Receipt, tone: "danger" },
  quote_expiring: { icon: FileText, tone: "accent" },
  case_assigned: { icon: Lifebuoy, tone: "primary" },
  case_sla: { icon: Alarm, tone: "danger" },
};

export function ruleLook(kind: string): { icon: Icon; tone: Tone } {
  return RULE_LOOK[kind as RuleKey] ?? { icon: Warning, tone: "neutral" };
}

/** Localized one-line message for a server notification (falls back to the server's English body). */
export function notificationText(
  tx: (k: string, p?: Record<string, string | number>) => string,
  n: AppNotification,
  locale: Locale,
): string {
  const p = n.params ?? {};
  const days = Math.abs(Number(p.days ?? 0));
  const d = (v: unknown) => (typeof v === "string" ? fmtDate(v, locale) : "—");
  switch (n.kind) {
    case "job_delayed":
      return tx("nt_msg_job_delayed", { days });
    case "eta_changed":
      return tx("nt_msg_eta_changed", { from: d(p.from), to: d(p.to) });
    case "doc_missing":
      return tx(p.state === "late" ? "nt_msg_doc_missing_late" : "nt_msg_doc_missing_wait", { doc: String(p.doc ?? n.title) });
    case "free_time": {
      const left = Number(p.days ?? 0);
      if (left < 0) return tx("nt_msg_free_time_over", { days });
      if (left === 0) return tx("nt_msg_free_time_today");
      return tx("nt_msg_free_time_soon", { days });
    }
    case "invoice_overdue":
      return tx("nt_msg_invoice_overdue", { amount: fmtMoney(Number(p.amount ?? 0), String(p.currency ?? "THB"), locale), days });
    case "quote_expiring":
      return Number(p.days ?? 0) === 0 ? tx("nt_msg_quote_expiring_today") : tx("nt_msg_quote_expiring", { days });
    case "case_assigned":
      return tx("nt_msg_case_assigned", { subject: String(p.subject ?? n.body) });
    case "case_sla":
      return tx(p.timer === "first" ? "nt_msg_case_sla_first" : "nt_msg_case_sla_resolve", { hours: Number(p.hours ?? 0) });
    default:
      return n.body;
  }
}
