import { useCallback, useMemo } from "react";
import { customerName, type Customer } from "../../data";
import { useShellCrm } from "../../shell/crmStore.tsx";
import { useStore } from "../../store";
import { useAppMode } from "./useAppMode.ts";
import { useCrmBundle } from "./useCommercial.ts";

/**
 * Resolve a customer id to a display name in both shell (demo) and live API mode.
 * Never show raw ids like "c1" or UUIDs to people.
 */
export function useCustomerLookup() {
  const { live } = useAppMode();
  const { locale } = useStore();
  const crm = useShellCrm();
  const bundle = useCrmBundle();

  const map = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of crm.customers) m.set(c.id, c as Customer);
    if (live) for (const c of bundle.data?.customers ?? []) m.set(c.id, c);
    return m;
  }, [crm.customers, bundle.data, live]);

  const nameOf = useCallback(
    (id: string | null | undefined, fallback = "—") => {
      if (!id) return fallback;
      const c = map.get(id);
      if (!c) return fallback;
      const loose = c as Customer & { name?: string };
      return customerName(c, locale) || loose.nameEn || loose.nameZh || loose.name || fallback;
    },
    [map, locale],
  );

  return { nameOf, customers: [...map.values()], loading: live && bundle.isLoading };
}
