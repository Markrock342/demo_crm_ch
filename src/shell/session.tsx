import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { authStub } from "../adapters/stub/auth.stub.ts";
import type { Department, ShellUser } from "./types.ts";

type ShellSessionValue = {
  shellUser: ShellUser | null;
  enterAs: (department: Department) => Promise<void>;
  leave: () => void;
};

const ShellCtx = createContext<ShellSessionValue | null>(null);

const STORAGE_KEY = "cangzhan-shell-dept";

function readStored(): ShellUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShellUser;
  } catch {
    return null;
  }
}

export function ShellSessionProvider({ children }: { children: ReactNode }) {
  const [shellUser, setShellUser] = useState<ShellUser | null>(() => readStored());

  const enterAs = useCallback(async (department: Department) => {
    const user = await authStub.enterAsDepartment(department);
    setShellUser(user);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }, []);

  const leave = useCallback(() => {
    setShellUser(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ shellUser, enterAs, leave }), [shellUser, enterAs, leave]);

  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>;
}

export function useShellSession() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShellSession");
  return ctx;
}

/** True when the app is driven by the P0 shell session (empty walkthrough). */
export function useIsShellMode() {
  const { shellUser } = useShellSession();
  return Boolean(shellUser);
}
