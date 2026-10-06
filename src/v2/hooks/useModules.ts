import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ALL_MODULES_ON, fetchModules, type ModuleKey, type ModulesState } from "../../api/modules.ts";
import { useAuth } from "../../auth/AuthProvider";

export const modulesQueryKey = (orgId: string | null | undefined) => ["organization-modules", orgId ?? ""] as const;

const storeKey = (orgId: string) => `cz.modules.${orgId}`;

/** Last known switches for this company, so the menu doesn't flash on reload (per browser; convenience only). */
function readCached(orgId: string | null | undefined): ModulesState | undefined {
  if (!orgId) return undefined;
  try {
    const raw = localStorage.getItem(storeKey(orgId));
    if (!raw) return undefined;
    const v = JSON.parse(raw) as ModulesState;
    return v && typeof v.modules === "object" ? { modules: { ...ALL_MODULES_ON, ...v.modules }, preset: v.preset ?? null } : undefined;
  } catch {
    return undefined;
  }
}

export function rememberModules(orgId: string | null | undefined, v: ModulesState) {
  if (!orgId) return;
  try {
    localStorage.setItem(storeKey(orgId), JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}

/**
 * The signed-in company's modules (GET /api/organization/modules).
 * `ready` is false until the switches are known (from the server or the last visit).
 */
export function useModules() {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? null;
  const query = useQuery({
    queryKey: modulesQueryKey(orgId),
    queryFn: async () => {
      const v = await fetchModules();
      rememberModules(orgId, v);
      return v;
    },
    enabled: Boolean(user),
    initialData: () => readCached(orgId),
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
  const modules = query.data?.modules ?? ALL_MODULES_ON;
  const isOn = useCallback((k: ModuleKey) => modules[k] !== false, [modules]);
  return { modules, preset: query.data?.preset ?? null, ready: Boolean(query.data), isOn };
}

/** Put fresh switches into the cache (after an admin changes them) so menus update at once. */
export function useSetModulesCache() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useCallback(
    (v: ModulesState) => {
      rememberModules(user?.organizationId, v);
      qc.setQueryData(modulesQueryKey(user?.organizationId), v);
    },
    [qc, user?.organizationId],
  );
}
