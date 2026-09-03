import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadPersisted, savePersisted } from "./persist.ts";
import { useShellBilling } from "./billingStore.tsx";
import { useShellJobs } from "./jobStore.tsx";
import { useShellNotifications } from "./notificationStore.tsx";
import { useShellOps } from "./opsStore.tsx";
import { useShellSupport } from "./supportStore.tsx";

const STORAGE_KEY = "cangzhan-shell-automation-v4";
const VERSION = 4;

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  event: "missing_doc" | "eta_changed" | "invoice_overdue";
};

export type AutomationAudit = {
  id: string;
  at: string;
  ruleId: string;
  ruleName: string;
  detail: string;
};

type Snapshot = {
  rules: AutomationRule[];
  auditLog: AutomationAudit[];
};

const DEFAULT_RULES: AutomationRule[] = [
  { id: "rule-missing-doc", name: "Missing C/O or doc flag → notify", enabled: true, event: "missing_doc" },
  { id: "rule-eta", name: "ETA changed → notify", enabled: true, event: "eta_changed" },
  { id: "rule-ar", name: "Invoice overdue → notify", enabled: true, event: "invoice_overdue" },
];

function seed(): Snapshot {
  return { rules: DEFAULT_RULES, auditLog: [] };
}

type AutomationValue = {
  rules: AutomationRule[];
  auditLog: AutomationAudit[];
  setRuleEnabled: (id: string, enabled: boolean) => void;
  runRules: () => number;
};

const Ctx = createContext<AutomationValue | null>(null);

export function ShellAutomationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Snapshot>(() => loadPersisted<Snapshot>(STORAGE_KEY, VERSION) ?? seed());
  const jobs = useShellJobs();
  const ops = useShellOps();
  const billing = useShellBilling();
  const support = useShellSupport();
  const notes = useShellNotifications();

  useEffect(() => {
    savePersisted(STORAGE_KEY, VERSION, state);
  }, [state]);

  const setRuleEnabled = useCallback((id: string, enabled: boolean) => {
    setState((s) => ({
      ...s,
      rules: s.rules.map((r) => (r.id === id ? { ...r, enabled } : r)),
      auditLog: [
        {
          id: `aa${Date.now()}`,
          at: new Date().toISOString(),
          ruleId: id,
          ruleName: s.rules.find((r) => r.id === id)?.name ?? id,
          detail: enabled ? "enabled" : "disabled",
        },
        ...s.auditLog,
      ].slice(0, 100),
    }));
  }, []);

  const runRules = useCallback(() => {
    let fired = 0;
    const audits: AutomationAudit[] = [];
    const enabled = new Set(state.rules.filter((r) => r.enabled).map((r) => r.event));

    if (enabled.has("missing_doc")) {
      const docs = support.docs.filter((d) => d.docType === "CO" && (d.status === "wait" || d.status === "late"));
      const flagged = ops.boxes.filter((b) => b.missingDoc || b.coPending);
      if (docs.length || flagged.length) {
        fired++;
        audits.push({
          id: `aa${Date.now()}-doc`,
          at: new Date().toISOString(),
          ruleId: "rule-missing-doc",
          ruleName: "Missing C/O or doc flag → notify",
          detail: `docs=${docs.length} boxes=${flagged.length}`,
        });
      }
    }

    if (enabled.has("eta_changed")) {
      const changed = ops.boxes.filter((b) => b.etaChanged);
      if (changed.length) {
        fired++;
        audits.push({
          id: `aa${Date.now()}-eta`,
          at: new Date().toISOString(),
          ruleId: "rule-eta",
          ruleName: "ETA changed → notify",
          detail: `boxes=${changed.length}`,
        });
      }
    }

    if (enabled.has("invoice_overdue")) {
      const overdue = billing.invoices.filter((i) => i.status === "OVERDUE" || (i.balanceDue > 0 && i.dueDate && i.dueDate < new Date().toISOString().slice(0, 10)));
      if (overdue.length) {
        fired++;
        audits.push({
          id: `aa${Date.now()}-ar`,
          at: new Date().toISOString(),
          ruleId: "rule-ar",
          ruleName: "Invoice overdue → notify",
          detail: `invoices=${overdue.length}`,
        });
      }
    }

    if (audits.length) {
      setState((s) => ({ ...s, auditLog: [...audits, ...s.auditLog].slice(0, 100) }));
      try {
        notes.refreshFromShell();
      } catch {
        /* optional */
      }
    }

    void jobs;
    return fired;
  }, [billing.invoices, jobs, notes, ops.boxes, state.rules, support.docs]);

  useEffect(() => {
    // initial evaluation when rules change
    const t = window.setTimeout(() => runRules(), 0);
    return () => window.clearTimeout(t);
  }, [state.rules]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({ rules: state.rules, auditLog: state.auditLog, setRuleEnabled, runRules }),
    [state.rules, state.auditLog, setRuleEnabled, runRules],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShellAutomation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShellAutomation");
  return ctx;
}
