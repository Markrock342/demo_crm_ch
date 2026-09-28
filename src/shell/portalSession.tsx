import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchPortalMe, portalLogin, portalLogout, type PortalMe } from "../api/portal.ts";

/**
 * Customer-portal session, backed by the server's HttpOnly portal cookie.
 * `session` is whatever /api/portal/me returns; nothing is trusted from browser storage.
 */
export type PortalSession = PortalMe;

type PortalValue = {
  session: PortalSession | null;
  loading: boolean;
  /** Sign in with contact e-mail + access code. Throws Error(code) on failure. */
  login: (email: string, code: string) => Promise<void>;
  leave: () => Promise<void>;
};

const LEGACY_KEY = "cangzhan-portal-session";
const Ctx = createContext<PortalValue | null>(null);

export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      sessionStorage.removeItem(LEGACY_KEY);
    } catch {
      /* storage blocked */
    }
    let alive = true;
    fetchPortalMe()
      .then((me) => alive && setSession(me))
      .catch(() => alive && setSession(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (email: string, code: string) => {
    await portalLogin(email, code);
    setSession(await fetchPortalMe());
  }, []);

  const leave = useCallback(async () => {
    try {
      await portalLogout();
    } catch {
      /* cookie may already be gone */
    }
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, loading, login, leave }), [session, loading, login, leave]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortalSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortalSession");
  return ctx;
}
