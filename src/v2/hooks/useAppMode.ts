import { useAuth } from "../../auth/AuthProvider";

/** The app only runs against the real API: `live` once a staff user is signed in. */
export function useAppMode() {
  const { user } = useAuth();
  const live = Boolean(user);
  return { shell: false as const, live, demo: false as const, api: live, enabled: live };
}
