/** Default tenant timezone — override from org settings when available. */
export const DEFAULT_TENANT_TIMEZONE = "Asia/Bangkok";

/** ISO date (YYYY-MM-DD) in tenant timezone. */
export function todayIso(timezone = DEFAULT_TENANT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Month-day key (MM-DD) used by legacy job ETD/ETA seed fields. */
export function todayMonthDay(timezone = DEFAULT_TENANT_TIMEZONE): string {
  const [y, m, d] = todayIso(timezone).split("-");
  void y;
  return `${m}-${d}`;
}

export function isBeforeToday(isoDate: string, timezone = DEFAULT_TENANT_TIMEZONE): boolean {
  return isoDate < todayIso(timezone);
}

/** Match job date strings (MM-DD or YYYY-MM-DD) against today in tenant TZ. */
export function jobDateIsToday(jobDate: string | undefined, timezone = DEFAULT_TENANT_TIMEZONE): boolean {
  if (!jobDate?.trim()) return false;
  const today = todayIso(timezone);
  const mmdd = todayMonthDay(timezone);
  if (jobDate === mmdd || jobDate === today) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) {
    return jobDate === today || jobDate.slice(5) === mmdd;
  }
  return false;
}
