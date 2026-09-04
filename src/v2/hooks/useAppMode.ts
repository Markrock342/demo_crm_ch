import { useAuth } from "../../auth/AuthProvider";
import { useIsShellMode } from "../../shell/session.tsx";

export function useAppMode() {
  const shell = useIsShellMode();
  const { mode, user } = useAuth();
  const live = !shell && mode === "production" && Boolean(user);
  const demo = mode === "demo";
  return { shell, live, demo, api: live, enabled: shell || live };
}
