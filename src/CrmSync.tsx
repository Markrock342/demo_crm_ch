import { useEffect, useRef } from "react";
import { useAuth } from "./auth/AuthProvider.tsx";
import { fetchCrmDocs, fetchMails } from "./api/comms.ts";
import { fetchCrmBundle } from "./api/crm.ts";
import { useStore } from "./store.tsx";

/** Loads CRM + mail/docs from PostgreSQL when running in production mode. */
export function CrmSync() {
  const { mode, user, loading } = useAuth();
  const { hydrateCrm, hydrateComms } = useStore();
  const loaded = useRef(false);

  useEffect(() => {
    if (loading || mode !== "production" || !user || loaded.current) return;
    loaded.current = true;
    void Promise.all([fetchCrmBundle(), fetchMails(), fetchCrmDocs()])
      .then(([crm, mails, docs]) => {
        hydrateCrm(crm);
        hydrateComms({ mails, docs });
      })
      .catch(() => {
        loaded.current = false;
      });
  }, [mode, user, loading, hydrateCrm, hydrateComms]);

  useEffect(() => {
    if (mode === "demo") loaded.current = false;
  }, [mode]);

  return null;
}
