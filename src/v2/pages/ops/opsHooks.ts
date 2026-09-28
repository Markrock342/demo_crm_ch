import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { fetchJobs } from "../../../api/commercial.ts";
import { customerName, type Customer } from "../../../data";
import { useShellJobs } from "../../../shell/jobStore.tsx";
import { useStore } from "../../../store";
import { useAppMode } from "../../hooks/useAppMode.ts";
import { useCustomerLookup } from "../../hooks/useCustomerLookup.ts";

/** Job id → job number ("JOB-2026-000002") in shell and live mode. Never show raw ids. */
export function useJobNumbers() {
  const { live } = useAppMode();
  const shellJobs = useShellJobs();
  const q = useQuery({
    queryKey: ["ops", "job-numbers"],
    queryFn: () => fetchJobs(),
    enabled: live,
    staleTime: 60_000,
  });
  const map = useMemo(() => {
    const m = new Map<string, { jobNumber: string; customerId: string }>();
    for (const j of shellJobs.jobs) m.set(j.id, { jobNumber: j.jobNumber, customerId: j.customerId });
    for (const j of q.data ?? []) m.set(j.id, { jobNumber: j.jobNumber, customerId: j.customerId });
    return m;
  }, [q.data, shellJobs.jobs]);
  const jobNumberOf = useCallback((id: string | null | undefined) => (id ? map.get(id)?.jobNumber : undefined), [map]);
  const jobCustomerOf = useCallback((id: string | null | undefined) => (id ? map.get(id)?.customerId : undefined), [map]);
  return { jobNumberOf, jobCustomerOf };
}

/** Customer name from the shared lookup, falling back to the local store (seed/demo customers). */
export function useCustomerName() {
  const { nameOf } = useCustomerLookup();
  const { customers, locale } = useStore();
  return useCallback(
    (id: string | null | undefined) => {
      if (!id) return "—";
      const n = nameOf(id, "");
      if (n) return n;
      const c = customers.find((x) => x.id === id);
      return c ? customerName(c as Customer, locale) : "—";
    },
    [customers, locale, nameOf],
  );
}
