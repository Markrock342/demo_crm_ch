import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { fetchUsers, type OrgUser } from "../../api/users.ts";
import { useStore } from "../../store";
import { personName } from "../pages/jobsShared.ts";
import { localizeDemo } from "../lib/demoText.ts";
import { useAppMode } from "./useAppMode.ts";

export const userQueryKey = ["users", "org"] as const;

/** A person's name in the UI language (zh → nameZh, th → nameTh, else the English / pinyin name). */
export function userDisplayName(u: Pick<OrgUser, "name" | "nameZh" | "nameTh">, locale: string): string {
  if (locale === "zh" && u.nameZh) return u.nameZh;
  if (locale === "th" && u.nameTh) return u.nameTh;
  return u.name || u.nameZh || u.nameTh || "";
}

/**
 * Resolve a user id (sales owner, operator, task owner…) to a display name.
 * Live mode looks ids up in the org directory (GET /api/users); values that are already
 * names pass through; unknown ids (UUID / "u1") become the fallback — never shown raw.
 */
export function useUserLookup() {
  const { live } = useAppMode();
  const { locale } = useStore();
  const query = useQuery({
    queryKey: userQueryKey,
    queryFn: fetchUsers,
    enabled: live,
    staleTime: 5 * 60 * 1000,
  });

  const map = useMemo(() => {
    const m = new Map<string, OrgUser>();
    if (live) for (const u of query.data ?? []) m.set(u.id, u);
    return m;
  }, [live, query.data]);

  const nameOf = useCallback(
    (id: string | null | undefined, fallback = "") => {
      const key = (id ?? "").trim();
      if (!key) return fallback;
      const u = map.get(key);
      if (u) return userDisplayName(u, locale) || fallback;
      return localizeDemo(personName(key), locale) || fallback;
    },
    [map, locale],
  );

  return { nameOf, users: query.data ?? [], loading: live && query.isLoading };
}
