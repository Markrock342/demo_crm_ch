import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Department, ShellUser } from "./types.ts";

/**
 * Legacy walkthrough ("shell") session — permanently disabled.
 *
 * The app only signs in through the real API. This provider keeps the old hook shape so existing
 * `shell ? … : …` branches compile, but `shellUser` is always null and any session persisted by an
 * older build is wiped on load.
 */
type ShellSessionValue = {
  shellUser: ShellUser | null;
  enterAs: (department: Department) => Promise<void>;
  leave: () => void;
};

const ShellCtx = createContext<ShellSessionValue | null>(null);

const STORAGE_KEY = "cangzhan-shell-dept";

function clearPersisted() {
  for (const store of [globalThis.sessionStorage, globalThis.localStorage]) {
    try {
      store?.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
  }
}

clearPersisted();

const VALUE: ShellSessionValue = {
  shellUser: null,
  enterAs: async () => {
    throw new Error("shell_mode_disabled");
  },
  leave: clearPersisted,
};

export function ShellSessionProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => VALUE, []);
  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>;
}

export function useShellSession() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShellSession");
  return ctx;
}

/** Always false: the walkthrough mode is not reachable in the production app. */
export function useIsShellMode() {
  return false;
}
