import { useCallback } from "react";
import { useAuth } from "../../auth/AuthProvider";

/** Permission check against the signed-in user's server permissions (e.g. "invoice.view"). */
export function useCan() {
  const { user } = useAuth();
  return useCallback(
    (perm: string) => Boolean(user && (user.roles.includes("SUPER_ADMIN") || user.permissions.includes(perm))),
    [user],
  );
}
