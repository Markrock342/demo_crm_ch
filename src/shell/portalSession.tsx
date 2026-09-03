import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type PortalSession = {
  customerId: string;
  enteredAt: string;
};

type PortalValue = {
  session: PortalSession | null;
  enter: (customerId: string, pin: string, expectedPin?: string) => string | null;
  leave: () => void;
};

const STORAGE_KEY = "cangzhan-portal-session";
const Ctx = createContext<PortalValue | null>(null);

function read(): PortalSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PortalSession;
  } catch {
    return null;
  }
}

export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PortalSession | null>(() => read());

  const enter = useCallback((customerId: string, pin: string, expectedPin = "demo") => {
    if (!customerId) return "errorSave";
    const want = (expectedPin || "demo").trim() || "demo";
    if (pin.trim() && pin.trim() !== want) return "portalBadPin";
    // empty PIN allowed (optional); non-empty must match
    const s = { customerId, enteredAt: new Date().toISOString() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
    return null;
  }, []);

  const leave = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, enter, leave }), [session, enter, leave]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortalSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortalSession");
  return ctx;
}
