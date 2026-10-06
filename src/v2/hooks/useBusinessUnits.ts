import { useQuery } from "@tanstack/react-query";
import { fetchBusinessUnits, type BusinessUnit } from "../../api/businessUnits.ts";

export const businessUnitsKey = ["business-units"] as const;

/** Active business units (ธุรกิจในเครือ) for pickers, filters and chips; `all` adds archived ones. */
export function useBusinessUnits(all = false) {
  const q = useQuery<BusinessUnit[]>({
    queryKey: [...businessUnitsKey, all ? "all" : "active"],
    queryFn: () => fetchBusinessUnits(all),
    staleTime: 5 * 60_000,
  });
  const units = q.data ?? [];
  return { ...q, units, byId: new Map(units.map((u) => [u.id, u])) };
}
