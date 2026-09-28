import type { Locale } from "../../../i18n";
import type { Tone } from "../../components";

const intlLocale: Record<Locale, string> = {
  zh: "zh-CN",
  th: "th-TH-u-ca-gregory",
  en: "en-GB",
};

/**
 * Ops data mixes ISO timestamps and short "MM-DD" stamps (seed + shell data).
 * Parse both; "MM-DD" is read as this year.
 */
export function parseOpsDate(value: string | null | undefined): Date | null {
  if (!value || value === "—") return null;
  const short = value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (short) {
    const d = new Date(new Date().getFullYear(), Number(short[1]) - 1, Number(short[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "4 Sep" / "4 ก.ย." — short day + month for operational dates. */
export function fmtOpsDate(value: string | null | undefined, locale: Locale, fallback = "—"): string {
  const d = parseOpsDate(value);
  if (!d) return fallback;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

/** Whole days from today (negative = in the past). */
export function daysFromToday(value: string | null | undefined): number | null {
  const d = parseOpsDate(value);
  if (!d) return null;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(d) - start(new Date())) / 86_400_000);
}

/* ── Container status ─────────────────────── */

export type BoxGroup = "yard" | "sea" | "customs" | "done" | "pending";

type BoxMeta = { group: BoxGroup; tone: Tone };

/** Covers both the legacy (live API) and the shell container status sets. */
const BOX_STATUS: Record<string, BoxMeta> = {
  // live / legacy
  yard: { group: "yard", tone: "progress" },
  empty: { group: "yard", tone: "neutral" },
  sail: { group: "sea", tone: "info" },
  hold: { group: "customs", tone: "danger" },
  clear: { group: "customs", tone: "success" },
  // shell
  waiting_booking: { group: "pending", tone: "neutral" },
  empty_pickup: { group: "yard", tone: "neutral" },
  stuffing: { group: "yard", tone: "progress" },
  gate_in: { group: "yard", tone: "progress" },
  loaded: { group: "sea", tone: "info" },
  in_transit: { group: "sea", tone: "info" },
  arrived: { group: "customs", tone: "progress" },
  customs: { group: "customs", tone: "warning" },
  do_ready: { group: "customs", tone: "success" },
  delivered: { group: "done", tone: "success" },
  empty_returned: { group: "done", tone: "neutral" },
  closed: { group: "done", tone: "neutral" },
};

export function boxMeta(status: string): BoxMeta {
  return BOX_STATUS[status] ?? { group: "pending", tone: "neutral" };
}

export function boxStatusLabel(tx: (k: string) => string, status: string): string {
  const key = `ops_box_${status}`;
  const v = tx(key);
  return v === key ? status.replace(/_/g, " ") : v;
}

/* ── Shipment status ──────────────────────── */

export const SHIPMENT_TONE: Record<string, Tone> = {
  booking: "neutral",
  gate_in: "progress",
  sail: "info",
  arrived: "warning",
  delivered: "success",
};

/* ── Document status ──────────────────────── */

export const DOC_TONE: Record<string, Tone> = {
  ok: "success",
  wait: "warning",
  late: "danger",
};
