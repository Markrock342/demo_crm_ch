import type { Locale } from "../../i18n";
import { fmtDateTime } from "./format.ts";

const intlLocale: Record<Locale, string> = { zh: "zh-CN", th: "th-TH-u-ca-gregory", en: "en-GB" };

function yesterdayWord(locale: Locale) {
  return new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: "auto" }).format(-1, "day");
}

function hhmm(d: Date, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale[locale], { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/**
 * Mail / activity time: "14:22" today, "yesterday 17:15", otherwise "18 Sep, 09:40".
 * Accepts ISO timestamps and legacy labels ("14:22", "昨 17:15").
 */
export function fmtMailTime(value: string | null | undefined, locale: Locale): string {
  const t = (value ?? "").trim();
  if (!t) return "";
  const legacy = t.match(/^(昨|昨天)\s*(\d{1,2}:\d{2})$/);
  if (legacy) return `${yesterdayWord(locale)} ${legacy[2]}`;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (diff === 0) return hhmm(d, locale);
  if (diff === 1) return `${yesterdayWord(locale)} ${hhmm(d, locale)}`;
  return fmtDateTime(d, locale);
}
