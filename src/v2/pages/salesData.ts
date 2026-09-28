import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { mapJobRowToShell } from "../../adapters/api/jobMapper.ts";
import { fetchJobs } from "../../api/commercial.ts";
import { useShellBilling } from "../../shell/billingStore.tsx";
import { useShellJobs } from "../../shell/jobStore.tsx";
import { useAppMode } from "../hooks/useAppMode.ts";
import { useLiveInvoices } from "../hooks/useCommercial.ts";
import { queryKeys } from "../queries/keys.ts";

/** Receivable split by age: not yet due / overdue ≤30 days / overdue >30 days. */
export type ArAging = { current: number; late: number; veryLate: number };

export type CustomerMoney = {
  activeJobs: number;
  balance: number;
  currency: string;
  aging: ArAging;
};

type InvLike = { customerId: string; balance: number; currency: string; dueDate: string | null };

export function agingOf(balance: number, dueDate: string | null | undefined, now = Date.now()): keyof ArAging {
  if (!dueDate || balance <= 0) return "current";
  const days = (now - new Date(dueDate).getTime()) / 86_400_000;
  if (Number.isNaN(days) || days <= 0) return "current";
  return days > 30 ? "veryLate" : "late";
}

/** Active jobs + open receivables per customer, in demo and live mode. */
export function useCustomerMoney(): Record<string, CustomerMoney> {
  const { shell, live } = useAppMode();
  const billing = useShellBilling();
  const jobsShell = useShellJobs();
  const invLive = useLiveInvoices();
  const jobsLive = useQuery({
    queryKey: queryKeys.jobs.list(),
    queryFn: async () => (await fetchJobs()).map((r) => mapJobRowToShell(r)),
    enabled: live,
  });

  return useMemo(() => {
    const invoices: InvLike[] = shell
      ? billing.invoices.map((i) => ({ customerId: i.customerId, balance: i.balanceDue, currency: i.currency, dueDate: i.dueDate ?? null }))
      : (invLive.data ?? []).map((i) => ({
          customerId: i.customerId,
          balance: Number(i.balanceDue) || 0,
          currency: i.currency,
          dueDate: i.dueDate,
        }));
    const jobs = shell ? jobsShell.jobs : (jobsLive.data ?? []);

    const out: Record<string, CustomerMoney> = {};
    const get = (id: string) => (out[id] ??= { activeJobs: 0, balance: 0, currency: "", aging: { current: 0, late: 0, veryLate: 0 } });
    for (const j of jobs) if (j.status !== "CLOSED") get(j.customerId).activeJobs += 1;

    // Main currency per customer = the one with the largest open balance.
    const byCur: Record<string, Record<string, number>> = {};
    for (const i of invoices) {
      if (i.balance <= 0) continue;
      const m = (byCur[i.customerId] ??= {});
      m[i.currency] = (m[i.currency] ?? 0) + i.balance;
    }
    const now = Date.now();
    for (const i of invoices) {
      if (i.balance <= 0) continue;
      const cur = Object.entries(byCur[i.customerId] ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (i.currency !== cur) continue;
      const row = get(i.customerId);
      row.currency = cur;
      row.balance += i.balance;
      row.aging[agingOf(i.balance, i.dueDate, now)] += i.balance;
    }
    return out;
  }, [shell, billing.invoices, invLive.data, jobsShell.jobs, jobsLive.data]);
}
