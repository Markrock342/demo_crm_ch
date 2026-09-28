import { useQuery } from "@tanstack/react-query";
import { Select } from "antd";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchJob } from "../../../api/commercial.ts";
import { fetchJobsPage } from "../../../api/lists.ts";
import type { Locale } from "../../../i18n";
import { useShellJobs } from "../../../shell/jobStore.tsx";
import { useStore } from "../../../store";
import { useAppMode } from "../../hooks/useAppMode.ts";
import { fmtDate, fmtMoney } from "../../lib/format.ts";
import "./finance.css";

/**
 * Resolve a job id to its human job number. Live rows carry their own job number (pass them as
 * `known`), so no full job list is fetched; demo mode reads the shell store. Never returns the raw id.
 */
export function useJobLookup(known?: ReadonlyArray<{ jobId: string | null; jobNumber?: string | null }>) {
  const { shell } = useAppMode();
  const shellJobs = useShellJobs();

  const map = useMemo(() => {
    const m = new Map<string, string>();
    if (shell) for (const j of shellJobs.jobs) m.set(j.id, j.jobNumber);
    for (const r of known ?? []) if (r.jobId && r.jobNumber) m.set(r.jobId, r.jobNumber);
    return m;
  }, [shell, shellJobs.jobs, known]);

  const numberOf = useCallback((id: string | null | undefined) => (id ? map.get(id) : undefined), [map]);
  const options = useMemo(() => [...map.entries()].map(([value, label]) => ({ value, label })), [map]);
  return { numberOf, options };
}

/**
 * Job picker that searches on the server (paged job list, 20 at a time), so it works with any
 * number of jobs. Drop-in for a Form.Item child (value / onChange).
 */
export function JobSelect({
  value,
  onChange,
  customerId,
  placeholder,
}: {
  value?: string | null;
  onChange?: (v: string | null) => void;
  customerId?: string;
  placeholder?: string;
}) {
  const { live } = useAppMode();
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);
  const found = useQuery({
    queryKey: ["fin", "job-search", q, customerId ?? ""],
    queryFn: () => fetchJobsPage({ q: q || undefined, customerId, limit: 20 }),
    enabled: live,
    staleTime: 30_000,
  });
  const items = found.data?.items ?? [];
  // Label for a pre-selected job that is not in the current results.
  const picked = useQuery({
    queryKey: ["fin", "job-label", value ?? ""],
    queryFn: () => fetchJob(value!),
    enabled: live && Boolean(value) && !items.some((j) => j.id === value),
    staleTime: 300_000,
  });
  const label = (j: { jobNumber: string; pol?: string | null; pod?: string | null }) => `${j.jobNumber} · ${j.pol ?? ""} → ${j.pod ?? ""}`;
  const options = items.map((j) => ({ value: j.id, label: label(j) }));
  if (value && picked.data && !options.some((o) => o.value === value)) options.unshift({ value, label: label(picked.data) });
  return (
    <Select
      allowClear
      showSearch
      filterOption={false}
      onSearch={setTyped}
      placeholder={placeholder}
      value={value ?? undefined}
      onChange={(v) => onChange?.((v as string | undefined) ?? null)}
      options={options}
      loading={found.isFetching}
    />
  );
}

/** Link to a job by its number; renders a dash when the job is unknown (never a raw id). */
export function JobLink({ id, numberOf }: { id: string | null | undefined; numberOf: (id: string | null | undefined) => string | undefined }) {
  const no = numberOf(id);
  if (!id || !no) return <span className="cz-muted">—</span>;
  return (
    <Link to={`/jobs/${id}`} className="fin-job-link">
      {no}
    </Link>
  );
}

const DAY = 86_400_000;

/** Whole days from today to the date (negative = past). */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((start(d) - start(new Date())) / DAY);
}

export function sumByCurrency<T>(rows: T[], amount: (r: T) => number, currency: (r: T) => string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const a = amount(r);
    if (!a) continue;
    const c = currency(r) || "USD";
    m.set(c, (m.get(c) ?? 0) + a);
  }
  return m;
}

/** "US$1,200.00 · ฿35,000.00" — largest currency first. */
export function fmtTotals(m: Map<string, number>, locale: Locale, empty = "0"): string {
  if (!m.size) return empty;
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => fmtMoney(n, c, locale))
    .join(" · ");
}

/** Drop ".00" cents for big summary numbers ("US$24,820.00 · ฿3,000.00" → "US$24,820 · ฿3,000"). */
export const noCents = (s: string) => s.replace(/[.,]00(?=\s|$)/g, "");

/** Due date with an "overdue 5 days" / "in 3 days" line; danger color when overdue. */
export function DueCell({ date, open }: { date: string | null | undefined; open: boolean }) {
  const { tx, locale } = useStore();
  const d = daysUntil(date);
  if (!date || d === null) return <span className="cz-muted">—</span>;
  let sub: React.ReactNode = null;
  let tone = "";
  if (open) {
    if (d < 0) {
      tone = "is-danger";
      sub = tx("fin_overdueDays", { n: -d });
    } else if (d === 0) {
      tone = "is-warning";
      sub = tx("fin_dueToday");
    } else if (d <= 7) {
      tone = "is-warning";
      sub = tx("fin_dueInDays", { n: d });
    }
  }
  return (
    <span className={`fin-due ${tone}`}>
      {fmtDate(date, locale)}
      {sub ? <span className="cz-cell-sub fin-due-sub">{sub}</span> : null}
    </span>
  );
}

/** Only warn when no data source is connected — never show data-source jargon otherwise. */
export function useModeNote() {
  const { tx } = useStore();
  const { shell, live } = useAppMode();
  return shell || live ? "" : tx("apiNotConfigured");
}

export type MobileItem = {
  key: string;
  title: ReactNode;
  status?: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
};

/** Phone layout for lists (≤640px): id + status on line 1, secondary + amount on line 2. */
export function MobileList({ items, empty }: { items: MobileItem[]; empty?: ReactNode }) {
  if (!items.length) return <div className="fin-mobile-list fin-mobile-empty">{empty}</div>;
  return (
    <ul className="fin-mobile-list">
      {items.map((it) => (
        <li
          key={it.key}
          className={it.onClick ? "is-clickable" : undefined}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a,button")) return;
            it.onClick?.();
          }}
        >
          <div className="fin-m-line">
            <span className="cz-cell-main">{it.title}</span>
            {it.status}
          </div>
          <div className="fin-m-line fin-m-sub">
            <span>{it.sub}</span>
            {it.value ? <span className="cz-num">{it.value}</span> : null}
          </div>
          {it.action ? <div className="fin-m-action">{it.action}</div> : null}
        </li>
      ))}
    </ul>
  );
}
