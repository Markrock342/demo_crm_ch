import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth/AuthProvider.tsx";
import { fetchCrmDocs, fetchMails } from "./api/comms.ts";
import { fetchCrmBundle } from "./api/crm.ts";
import { useStore } from "./store.tsx";

/** Loads CRM + mail/docs from the API once a user is signed in; retries with back-off on failure. */
export function CrmSync() {
  const { user, loading } = useAuth();
  const { hydrateCrm, hydrateComms, flash } = useStore();
  const loaded = useRef(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!user) loaded.current = false;
  }, [user]);

  useEffect(() => {
    if (loading || !user || loaded.current) return;
    loaded.current = true;
    let timer: number | undefined;
    void Promise.all([fetchCrmBundle(), fetchMails(), fetchCrmDocs()])
      .then(([crm, mails, docs]) => {
        hydrateCrm(crm);
        hydrateComms({ mails, docs });
      })
      .catch(() => {
        loaded.current = false;
        flash("errorLoad");
        timer = window.setTimeout(() => setAttempt((n) => n + 1), Math.min(30000, 3000 * 2 ** attempt));
      });
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [user, loading, attempt]);

  return null;
}
