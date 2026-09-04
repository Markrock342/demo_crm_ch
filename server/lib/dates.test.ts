import assert from "node:assert/strict";
import test from "node:test";

/** Mirrors src/lib/dates.ts — keep in sync until shared package extraction. */
const DEFAULT_TENANT_TIMEZONE = "Asia/Bangkok";

function todayIso(timezone = DEFAULT_TENANT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function todayMonthDay(timezone = DEFAULT_TENANT_TIMEZONE): string {
  const [, m, d] = todayIso(timezone).split("-");
  return `${m}-${d}`;
}

function isBeforeToday(isoDate: string, timezone = DEFAULT_TENANT_TIMEZONE): boolean {
  return isoDate < todayIso(timezone);
}

function jobDateIsToday(jobDate: string | undefined, timezone = DEFAULT_TENANT_TIMEZONE): boolean {
  if (!jobDate?.trim()) return false;
  const today = todayIso(timezone);
  const mmdd = todayMonthDay(timezone);
  if (jobDate === mmdd || jobDate === today) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) {
    return jobDate === today || jobDate.slice(5) === mmdd;
  }
  return false;
}

test("todayIso returns YYYY-MM-DD", () => {
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test("jobDateIsToday matches today", () => {
  assert.equal(jobDateIsToday(todayMonthDay()), true);
  assert.equal(jobDateIsToday("1999-01-01"), false);
});

test("isBeforeToday compares ISO dates", () => {
  assert.equal(isBeforeToday("1999-01-01"), true);
  assert.equal(isBeforeToday("2099-12-31"), false);
});
