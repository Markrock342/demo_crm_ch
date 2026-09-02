import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchHealth, fetchMe, login as loginApi, logout as logoutApi } from "./api";
import type { AppMode, AuthUser } from "./types";

type AuthContextValue = {
  mode: AppMode;
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppMode>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const health = await fetchHealth();
      if (health.mode === "demo") {
        setMode("demo");
        setUser(null);
        return;
      }
      setMode("production");
      const me = await fetchMe();
      setUser(me);
    } catch {
      setMode("demo");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await loginApi(email, password);
    setUser(u);
    setMode("production");
  }, []);

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ mode, user, loading, login, logout, refresh }),
    [mode, user, loading, login, logout, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth");
  return ctx;
}
