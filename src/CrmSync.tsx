import { useEffect, useRef } from "react";
import { useAuth } from "./auth/AuthProvider.tsx";
import { fetchCrmBundle } from "./api/crm.ts";
import { useStore } from "./store.tsx";

/** Loads CRM entities from PostgreSQL when running in production mode. */
export function CrmSync() {
  const { mode, user, loading } = useAuth();
  const { hydrateCrm } = useStore();
  const loaded = useRef(false);

  useEffect(() => {
    if (loading || mode !== "production" || !user || loaded.current) return;
    loaded.current = true;
    void fetchCrmBundle()
      .then(hydrateCrm)
      .catch(() => {
        loaded.current = false;
      });
  }, [mode, user, loading, hydrateCrm]);

  useEffect(() => {
    if (mode === "demo") loaded.current = false;
  }, [mode]);

  return null;
}
