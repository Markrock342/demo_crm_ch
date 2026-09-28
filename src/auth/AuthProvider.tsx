import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, login as loginApi, logout as logoutApi } from "./api";
import type { AppMode, AuthUser } from "./types";

/** Why the session check failed: the API could not be reached (network / 5xx). */
export type AuthError = "unreachable" | null;

type AuthContextValue = {
  /** Always "production" once loaded — the app only runs against the real API. */
  mode: AppMode;
  user: AuthUser | null;
  loading: boolean;
  error: AuthError;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const me = await fetchMe();
      setUser(me);
      setError(null);
    } catch {
      setUser(null);
      setError("unreachable");
    } finally {
      setMode("production");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await loginApi(email, password);
    setUser(u);
    setError(null);
    setMode("production");
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ mode, user, loading, error, login, logout, refresh }),
    [mode, user, loading, error, login, logout, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth");
  return ctx;
}
