import type { Locale } from "../../i18n";

const intlLocale: Record<Locale, string> = {
  zh: "zh-CN",
  th: "th-TH-u-ca-gregory",
  en: "en-GB",
};

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "18 Sep 2026" / "18 ก.ย. 2026" / "2026年9月18日" — never raw ISO in the UI. */
export function fmtDate(value: string | number | Date | null | undefined, locale: Locale, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return typeof value === "string" && value ? value : fallback;
  return new Intl.DateTimeFormat(intlLocale[locale], { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** Date plus time, for timestamps (activity, mail, audit). */
export function fmtDateTime(value: string | number | Date | null | undefined, locale: Locale, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return typeof value === "string" && value ? value : fallback;
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Relative day label for near dates ("today", "in 3 days"), absolute otherwise. */
export function fmtRelativeDay(value: string | number | Date | null | undefined, locale: Locale, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  const day = 86_400_000;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(new Date())) / day);
  if (Math.abs(diff) > 6) return fmtDate(d, locale);
  return new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: "auto" }).format(diff, "day");
}

export function fmtMoney(amount: number | string | null | undefined, currency = "USD", locale: Locale = "en"): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(intlLocale[locale], {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function fmtNumber(n: number | null | undefined, locale: Locale): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(intlLocale[locale]).format(n);
}

/** "CNSHA→THLCH" → "CNSHA → THLCH" with a thin arrow, for lanes. */
export function fmtLane(from?: string | null, to?: string | null): string {
  return `${from || "—"} → ${to || "—"}`;
}
